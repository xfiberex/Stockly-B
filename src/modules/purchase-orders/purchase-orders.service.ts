import { prisma } from "@/shared/lib/prisma";
import { $Enums, Prisma, type PurchaseOrderItem } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { costeMedioTrasRecepcion, mismoCoste } from "@/shared/lib/costeMedio";
import type { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, UpdatePurchaseOrderDto } from "./purchase-orders.types";

const ORDER_INCLUDE = {
    supplier: { select: { id: true, name: true } },
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

// Solo acepta como filtro un status que sea miembro válido del enum.
function parseStatusFilter(status?: string): $Enums.PurchaseOrderStatus | undefined {
    if (status && status in $Enums.PurchaseOrderStatus) {
        return status as $Enums.PurchaseOrderStatus;
    }
    return undefined;
}

type Tx = Prisma.TransactionClient;

/**
 * T5-04 — bloquea la orden hasta el final de la transacción y la devuelve con sus líneas
 * leídas **después** del bloqueo. Dos recepciones de la misma orden a la vez leerían el mismo
 * `receivedQuantity` y podrían pasarse entre las dos de lo pedido; así la segunda espera y ve
 * lo que dejó la primera.
 */
async function bloquearOrden(tx: Tx, id: string) {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
    if (filas.length === 0) throw new HttpError(404, "Orden de compra no encontrada", "PURCHASE_ORDER_NOT_FOUND");
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
}

/**
 * Mete en el inventario lo recibido de cada línea: suma `receivedQuantity`, y en las ligadas a
 * un producto, el stock, el movimiento `IN` y el coste medio (T5-01) **con la cantidad
 * recibida**, no con la pedida. Las líneas escritas a mano solo cuentan para cerrar la orden.
 */
async function registrarEntradas(tx: Tx, purchaseOrderId: string, lineas: Array<{ item: PurchaseOrderItem; cantidad: number }>) {
    for (const { item, cantidad } of lineas) {
        await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: { increment: cantidad } },
        });

        if (!item.productId) continue;

        const product = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: cantidad } },
        });

        // T5-01 — el coste se lee de la fila que devuelve el `update`, no de una
        // lectura previa. Ese `update` ya tiene la fila bloqueada hasta el final de la
        // transacción, así que dos recepciones simultáneas del mismo producto no
        // pueden promediar las dos sobre el mismo coste de partida: la segunda espera.
        const stockAntes = product.stock - cantidad;
        const costeNuevo = costeMedioTrasRecepcion(stockAntes, product.costPrice, cantidad, item.unitPrice);

        if (!mismoCoste(product.costPrice, costeNuevo)) {
            await tx.product.update({ where: { id: item.productId }, data: { costPrice: costeNuevo } });
            await tx.costHistory.create({
                data: {
                    productId: item.productId,
                    oldCost: product.costPrice,
                    newCost: costeNuevo,
                    source: "PURCHASE_RECEIPT",
                    purchaseOrderId,
                },
            });
        }

        await tx.stockMovement.create({
            data: {
                productId: item.productId,
                type: "IN",
                delta: cantidad,
                stockAfter: product.stock,
                note: `Orden de compra #${purchaseOrderId.slice(0, 8)}`,
            },
        });
    }
}

export const purchaseOrderService = {
    // Era la única lista de la API sin techo: traía todas las órdenes con el detalle
    // completo de cada ítem. Mismo contrato `{ data, meta }` que las de venta.
    async getAll(query: { page?: string; limit?: string; status?: string } = {}) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });

        const statusFilter = parseStatusFilter(query.status);
        const where = statusFilter ? { status: statusFilter } : {};

        const [orders, total] = await prisma.$transaction([
            prisma.purchaseOrder.findMany({
                where,
                skip,
                take: limit,
                include: ORDER_INCLUDE,
                orderBy: { createdAt: "desc" },
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        return { data: orders, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    async getById(id: string) {
        const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
        if (!order) throw new HttpError(404, "Orden de compra no encontrada", "PURCHASE_ORDER_NOT_FOUND");
        return order;
    },

    async create(dto: CreatePurchaseOrderDto) {
        return prisma.purchaseOrder.create({
            data: {
                supplierId: dto.supplierId ?? null,
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
    },

    async update(id: string, dto: UpdatePurchaseOrderDto) {
        // T5-04 — todo dentro de una transacción con la orden bloqueada. Antes el estado se leía
        // fuera, y dos «recibir» simultáneos veían los dos `PENDING` y sumaban el stock dos
        // veces; con recepciones parciales de por medio, el hueco sería además más ancho.
        return prisma.$transaction(async (tx) => {
            const orden = await bloquearOrden(tx, id);
            if (orden.status === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada", "CANNOT_MODIFY_CANCELLED_ORDER");

            const conRecepcion = orden.status === "PARTIALLY_RECEIVED" || orden.status === "RECEIVED";
            const orderData = {
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
            };

            // Volver a pendiente una orden que ya metió stock dejaría ese stock sin orden que lo
            // explique, y permitiría recibirlo otra vez. Antes de T5-04 se aceptaba en silencio.
            if (dto.status === "PENDING" && conRecepcion) {
                throw new HttpError(400, "No se puede devolver a pendiente una orden con mercancía recibida", "CANNOT_REOPEN_RECEIVED_ORDER");
            }

            // Marcar recibida recibe **lo que falta** de cada línea: todo, si estaba pendiente;
            // el resto, si iba a medias. Es la forma corta de una recepción completa.
            if (dto.status === "RECEIVED" && orden.status !== "RECEIVED") {
                const lineas = orden.items
                    .filter((item) => item.receivedQuantity < item.quantity)
                    .map((item) => ({ item, cantidad: item.quantity - item.receivedQuantity }));
                await registrarEntradas(tx, id, lineas);

                return tx.purchaseOrder.update({
                    where: { id },
                    data: { ...orderData, status: "RECEIVED" },
                    include: ORDER_INCLUDE,
                });
            }

            // Cancelación de una orden con mercancía recibida: se revierte lo que entró, en la
            // misma transacción. El decremento es condicional (stock >= cantidad) para no dejar
            // stock negativo si esas unidades ya salieron por una venta; en ese caso se rechaza
            // entera.
            //
            // T5-04 — **lo que entró es `receivedQuantity`, no `quantity`.** Cancelar una orden
            // recibida a medias retirando lo pedido sacaría unidades que nunca llegaron.
            //
            // T5-01 — **el coste medio no se toca al cancelar**, y es una decisión, no un olvido
            // (anotada en la ficha). Deshacer una media ponderada solo es exacto si no hubo otra
            // recepción ni un ajuste manual entre medias; dejarlo como está es siempre válido, y
            // si la compra tenía un precio atípico lo corrige la siguiente recepción o un ADMIN.
            if (dto.status === "CANCELLED" && conRecepcion) {
                const items = await tx.purchaseOrderItem.findMany({
                    where: { purchaseOrderId: id, productId: { not: null }, receivedQuantity: { gt: 0 } },
                    include: { product: true },
                });

                for (const item of items) {
                    if (!item.productId || !item.product) continue;
                    const retirar = item.receivedQuantity;

                    const res = await tx.product.updateMany({
                        where: { id: item.productId, stock: { gte: retirar } },
                        data: { stock: { decrement: retirar } },
                    });
                    if (res.count === 0) {
                        throw new HttpError(
                            400,
                            `No se puede cancelar: las unidades recibidas de "${item.product.name}" ya se consumieron. Disponible: ${item.product.stock}, requerido: ${retirar}`,
                            "CANNOT_CANCEL_UNITS_CONSUMED",
                            { producto: item.product.name, disponible: item.product.stock, requerido: retirar },
                        );
                    }

                    const refreshed = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            type: "OUT",
                            delta: -retirar,
                            stockAfter: refreshed.stock,
                            note: `Cancelación de orden de compra #${id.slice(0, 8)}`,
                        },
                    });
                }

                return tx.purchaseOrder.update({
                    where: { id },
                    data: { ...orderData, status: "CANCELLED" },
                    include: ORDER_INCLUDE,
                });
            }

            // Sin recepción ni cancelación de una recepción: actualización simple de campos / estado.
            return tx.purchaseOrder.update({
                where: { id },
                data: { ...orderData, ...(dto.status !== undefined && { status: dto.status }) },
                include: ORDER_INCLUDE,
            });
        });
    },

    /**
     * T5-04 — registra una entrega: unas cantidades por línea, no necesariamente todas ni
     * completas. La orden queda `RECEIVED` si con esto se completan todas sus líneas y
     * `PARTIALLY_RECEIVED` si no. Las líneas que no aparecen no reciben nada.
     */
    async receive(id: string, dto: ReceivePurchaseOrderDto) {
        return prisma.$transaction(async (tx) => {
            const orden = await bloquearOrden(tx, id);
            if (orden.status === "CANCELLED" || orden.status === "RECEIVED") {
                throw new HttpError(400, "Solo se puede recibir mercancía de una orden pendiente o recibida a medias", "ORDER_NOT_RECEIVABLE");
            }

            const porId = new Map(orden.items.map((item) => [item.id, item]));
            const lineas = dto.items.map((linea) => {
                const item = porId.get(linea.itemId);
                if (!item) throw new HttpError(404, "La línea no pertenece a esta orden de compra", "PURCHASE_ORDER_ITEM_NOT_FOUND");

                const pendiente = item.quantity - item.receivedQuantity;
                if (linea.quantity > pendiente) {
                    throw new HttpError(
                        400,
                        `No se pueden recibir ${linea.quantity} de "${item.productName}": quedan ${pendiente} por recibir`,
                        "RECEIPT_EXCEEDS_PENDING",
                        { producto: item.productName, pendiente, requerido: linea.quantity },
                    );
                }
                return { item, cantidad: linea.quantity };
            });

            await registrarEntradas(tx, id, lineas);

            const recibidoAhora = new Map(lineas.map((l) => [l.item.id, l.cantidad]));
            const completa = orden.items.every((item) => item.receivedQuantity + (recibidoAhora.get(item.id) ?? 0) === item.quantity);

            return tx.purchaseOrder.update({
                where: { id },
                data: { status: completa ? "RECEIVED" : "PARTIALLY_RECEIVED" },
                include: ORDER_INCLUDE,
            });
        });
    },

    async delete(id: string) {
        const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de compra no encontrada", "PURCHASE_ORDER_NOT_FOUND");
        // T5-04 — tampoco una recibida a medias: su stock ya entró y la orden es lo que lo explica.
        if (existing.status === "RECEIVED" || existing.status === "PARTIALLY_RECEIVED") {
            throw new HttpError(400, "No se puede eliminar una orden ya recibida", "CANNOT_DELETE_RECEIVED_ORDER");
        }

        await prisma.purchaseOrder.delete({ where: { id } });
    },

    /** Filas del archivo: una por línea de orden, no una por orden (T2-05). */
    async contarParaExportar() {
        return prisma.purchaseOrderItem.count();
    },

    /** Las órdenes en lotes, por cursor, aplanadas a una fila por línea (T2-05). */
    async *exportarPorLotes() {
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.purchaseOrder.findMany({
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                // Desempate por `id`: `createdAt` no es único y el cursor necesita un
                // orden total para no depender del que devuelva Postgres por su cuenta
                // (ver el detalle en `product.service.ts`).
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                include: {
                    supplier: { select: { name: true } },
                    items: { include: { product: { select: { sku: true } } } },
                },
            });

            if (pagina.length === 0) return;

            yield pagina.flatMap((o) =>
                o.items.map((item) => ({
                    orderId: o.id,
                    status: o.status,
                    supplierName: o.supplier?.name ?? "",
                    createdAt: o.createdAt.toISOString(),
                    productName: item.productName,
                    productSku: item.product?.sku ?? "",
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
