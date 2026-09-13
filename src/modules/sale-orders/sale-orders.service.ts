import { prisma } from "@/shared/lib/prisma";
import { $Enums } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { dispararAlertaStock } from "@/shared/lib/stockAlerts";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { filtroDeEnum } from "@/shared/lib/enums";
import { comprometidoPorProducto } from "@/shared/lib/stockComprometido";
import { Prisma } from "@/generated/prisma/client";
import type { CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

const ORDER_INCLUDE = {
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

// T3-02 — antes esto era `status in $Enums.SaleOrderStatus`, y la guarda tenía un agujero:
// los enums generados son objetos literales, así que heredan de `Object.prototype` y
// `"toString" in $Enums.SaleOrderStatus` devuelve **verdadero**. `?status=toString` pasaba
// el filtro, se casteaba a enum y reventaba dentro de Prisma con un 500. Reproducido antes
// de cambiarlo. `filtroDeEnum` usa `Object.hasOwn` y responde 400.
function parseStatusFilter(status?: string): $Enums.SaleOrderStatus | undefined {
    return filtroDeEnum($Enums.SaleOrderStatus, status, "status");
}

export const saleOrderService = {
    async getAll(query: { page?: string; limit?: string; status?: string }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });

        const statusFilter = parseStatusFilter(query.status);
        const where = statusFilter ? { status: statusFilter } : {};

        const [orders, total] = await prisma.$transaction([
            prisma.saleOrder.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE }),
            prisma.saleOrder.count({ where }),
        ]);

        return { data: orders, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    async getById(id: string) {
        const order = await prisma.saleOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
        if (!order) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        return order;
    },

    /**
     * T5-03 — una venta no puede pedir más de lo **disponible**: stock menos lo comprometido
     * en ventas pendientes. Antes solo se comprobaba al enviar, así que se aceptaban dos
     * ventas por las mismas unidades y la segunda fallaba cuando ya se le había prometido al
     * cliente. La decisión de la ficha fue **bloquear**, no avisar: la interfaz lo dice
     * mientras se escribe la cantidad y aquí se rechaza con 409.
     *
     * El mismo producto en varias líneas **suma**: dos líneas de 3 sobre 5 disponibles son 6.
     */
    async create(dto: CreateSaleOrderDto) {
        const pedido = new Map<string, number>();
        for (const item of dto.items) {
            if (item.productId) pedido.set(item.productId, (pedido.get(item.productId) ?? 0) + item.quantity);
        }
        const ids = [...pedido.keys()].sort();

        return prisma.$transaction(async (tx) => {
            if (ids.length > 0) {
                // Se bloquean las filas de los productos **antes** de contar lo comprometido.
                // Sin el bloqueo, dos ventas simultáneas de las mismas unidades leerían el
                // mismo disponible y pasarían las dos — que es el defecto que viene a cerrar
                // la tarea, solo que en una ventana más estrecha. Ordenadas por id, para que
                // dos ventas con productos en distinto orden no se esperen mutuamente.
                await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

                const productos = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, stock: true } });
                const comprometido = await comprometidoPorProducto(ids, tx);

                for (const id of ids) {
                    const producto = productos.find((p) => p.id === id);
                    if (!producto) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

                    const disponible = producto.stock - (comprometido.get(id) ?? 0);
                    const requerido = pedido.get(id)!;
                    if (requerido > disponible) {
                        throw new HttpError(
                            409,
                            `No hay suficiente disponible de "${producto.name}". Disponible: ${Math.max(disponible, 0)}, requerido: ${requerido}`,
                            "INSUFFICIENT_AVAILABLE_STOCK",
                            { producto: producto.name, disponible: Math.max(disponible, 0), requerido },
                        );
                    }
                }
            }

            return tx.saleOrder.create({
                data: {
                    customerName: dto.customerName,
                    customerEmail: dto.customerEmail,
                    customerPhone: dto.customerPhone,
                    notes: dto.notes,
                    items: {
                        create: dto.items.map((item) => ({
                            productId: item.productId ?? null,
                            productName: item.productName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                        })),
                    },
                },
                include: ORDER_INCLUDE,
            });
        });
    },

    async update(id: string, dto: UpdateSaleOrderDto) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        if (existing.status === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada", "CANNOT_MODIFY_CANCELLED_ORDER");
        if (existing.status === "SHIPPED" && dto.status === "SHIPPED") {
            throw new HttpError(400, "La orden ya fue enviada", "ORDER_ALREADY_SHIPPED");
        }

        const customerData = {
            ...(dto.customerName !== undefined && { customerName: dto.customerName }),
            ...(dto.customerEmail !== undefined && { customerEmail: dto.customerEmail }),
            ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
        };

        const beingShipped = existing.status !== "SHIPPED" && dto.status === "SHIPPED";
        // Cancelar una orden ya enviada debe devolver al inventario lo que salió con ella.
        const beingCancelled = existing.status === "SHIPPED" && dto.status === "CANCELLED";

        // Sin envío ni cancelación de un envío: actualización simple de campos / estado.
        if (!beingShipped && !beingCancelled) {
            return prisma.saleOrder.update({
                where: { id },
                data: { ...customerData, ...(dto.status !== undefined && { status: dto.status }) },
                include: ORDER_INCLUDE,
            });
        }

        // Cancelación de una orden enviada: reposición de stock, movimientos compensatorios
        // y cambio de estado en UNA sola transacción, simétrica al envío.
        if (beingCancelled) {
            return prisma.$transaction(async (tx) => {
                const items = await tx.saleOrderItem.findMany({
                    where: { saleOrderId: id, productId: { not: null } },
                });

                for (const item of items) {
                    if (!item.productId) continue;

                    const product = await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } },
                    });

                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            type: "IN",
                            delta: item.quantity,
                            stockAfter: product.stock,
                            note: `Cancelación de orden de venta #${id.slice(0, 8)}`,
                        },
                    });
                }

                return tx.saleOrder.update({
                    where: { id },
                    data: { ...customerData, status: "CANCELLED" },
                    include: ORDER_INCLUDE,
                });
            });
        }

        // Envío: verificación de stock, descuento, movimientos y cambio de estado ocurren
        // en UNA sola transacción. El decremento condicional (stock >= cantidad) cierra la
        // ventana entre "comprobar" y "descontar"; si cualquier ítem falla, todo se revierte.
        const lowStockTargets: Array<{ name: string; newStock: number; minStock: number }> = [];

        const updated = await prisma.$transaction(async (tx) => {
            const items = await tx.saleOrderItem.findMany({
                where: { saleOrderId: id, productId: { not: null } },
                include: { product: true },
            });

            for (const item of items) {
                if (!item.productId || !item.product) continue;

                const res = await tx.product.updateMany({
                    where: { id: item.productId, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity } },
                });
                if (res.count === 0) {
                    throw new HttpError(
                        400,
                        `Stock insuficiente para "${item.product.name}". Disponible: ${item.product.stock}, requerido: ${item.quantity}`,
                        "INSUFFICIENT_STOCK",
                        { producto: item.product.name, disponible: item.product.stock, requerido: item.quantity },
                    );
                }

                const refreshed = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });

                // T5-02 — el coste se congela en el ítem **al enviar**, que es cuando la
                // mercancía sale. Se lee de `refreshed` y no del `include` de arriba: esa
                // lectura es anterior al `updateMany` que bloquea la fila, y entre las dos una
                // recepción podría haber cambiado el coste medio.
                await tx.saleOrderItem.update({ where: { id: item.id }, data: { unitCost: refreshed.costPrice } });

                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        type: "OUT",
                        delta: -item.quantity,
                        stockAfter: refreshed.stock,
                        note: `Orden de venta #${id.slice(0, 8)}`,
                    },
                });

                if (refreshed.stock <= item.product.minStock) {
                    lowStockTargets.push({
                        name: item.product.name,
                        newStock: refreshed.stock,
                        minStock: item.product.minStock,
                    });
                }
            }

            return tx.saleOrder.update({
                where: { id },
                data: { ...customerData, status: "SHIPPED", shippedAt: new Date() },
                include: ORDER_INCLUDE,
            });
        });

        // Alertas best-effort, fuera de la transacción y **sin esperarlas** (T2-07):
        // aquí eran una por producto y en serie, así que enviar la orden costaba
        // tantas idas y vueltas al SMTP como productos bajaran de mínimo.
        for (const target of lowStockTargets) {
            dispararAlertaStock(target.name, target.newStock, target.minStock);
        }

        return updated;
    },

    async delete(id: string) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        if (existing.status === "SHIPPED") throw new HttpError(400, "No se puede eliminar una orden ya enviada", "CANNOT_DELETE_SHIPPED_ORDER");

        await prisma.saleOrder.delete({ where: { id } });
    },

    /**
     * T2-05 — filas del archivo, que **no** son órdenes: cada línea de una orden es una
     * fila. Contar órdenes dejaría el tope de la exportación corto por un factor que
     * depende de cuántos productos lleve cada una.
     */
    async contarParaExportar() {
        return prisma.saleOrderItem.count();
    },

    /** Las órdenes en lotes, por cursor, aplanadas a una fila por línea (T2-05). */
    async *exportarPorLotes() {
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.saleOrder.findMany({
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                // El desempate por `id` da un orden total, que es lo que hace correcta
                // la paginación sin depender de que Postgres devuelva el mismo orden
                // arbitrario en cada página (ver el detalle en `product.service.ts`).
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                include: ORDER_INCLUDE,
            });

            if (pagina.length === 0) return;

            yield pagina.flatMap((o) =>
                o.items.map((item) => ({
                    orderId: o.id,
                    status: o.status,
                    customerName: o.customerName ?? "",
                    customerEmail: o.customerEmail ?? "",
                    createdAt: o.createdAt.toISOString(),
                    productName: item.productName,
                    quantity: item.quantity,
                    unitPrice: Number(item.unitPrice),
                    totalLine: item.quantity * Number(item.unitPrice),
                })),
            );

            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },
};
