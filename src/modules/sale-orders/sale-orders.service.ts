import { prisma } from "@/shared/lib/prisma";
import { $Enums } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { checkLowStockAlert } from "@/shared/lib/stockAlerts";
import type { CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

const ORDER_INCLUDE = {
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

// Solo acepta como filtro un status que sea miembro válido del enum.
function parseStatusFilter(status?: string): $Enums.SaleOrderStatus | undefined {
    if (status && status in $Enums.SaleOrderStatus) {
        return status as $Enums.SaleOrderStatus;
    }
    return undefined;
}

export const saleOrderService = {
    async getAll(query: { page?: string; limit?: string; status?: string }) {
        const page = Math.max(1, parseInt(query.page ?? "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
        const skip = (page - 1) * limit;

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
        if (!order) throw new HttpError(404, "Orden de venta no encontrada");
        return order;
    },

    async create(dto: CreateSaleOrderDto) {
        return prisma.saleOrder.create({
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
    },

    async update(id: string, dto: UpdateSaleOrderDto) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada");
        if (existing.status === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada");
        if (existing.status === "SHIPPED" && dto.status === "SHIPPED") {
            throw new HttpError(400, "La orden ya fue enviada");
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
                    );
                }

                const refreshed = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
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
                data: { ...customerData, status: "SHIPPED" },
                include: ORDER_INCLUDE,
            });
        });

        // Alertas best-effort, ya fuera de la transacción para no retener locks durante el SMTP.
        for (const target of lowStockTargets) {
            await checkLowStockAlert(target.name, target.newStock, target.minStock);
        }

        return updated;
    },

    async delete(id: string) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada");
        if (existing.status === "SHIPPED") throw new HttpError(400, "No se puede eliminar una orden ya enviada");

        await prisma.saleOrder.delete({ where: { id } });
    },

    async exportAll() {
        const orders = await prisma.saleOrder.findMany({
            orderBy: { createdAt: "desc" },
            include: ORDER_INCLUDE,
        });

        const rows: Record<string, unknown>[] = [];
        for (const o of orders) {
            for (const item of o.items) {
                rows.push({
                    orderId: o.id,
                    status: o.status,
                    customerName: o.customerName ?? "",
                    customerEmail: o.customerEmail ?? "",
                    createdAt: o.createdAt.toISOString(),
                    productName: item.productName,
                    quantity: item.quantity,
                    unitPrice: Number(item.unitPrice),
                    totalLine: item.quantity * Number(item.unitPrice),
                });
            }
        }
        return rows;
    },
};
