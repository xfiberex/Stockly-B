import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import type { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from "./purchase-orders.types";

const ORDER_INCLUDE = {
    supplier: { select: { id: true, name: true } },
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

export const purchaseOrderService = {
    async getAll() {
        return prisma.purchaseOrder.findMany({
            include: ORDER_INCLUDE,
            orderBy: { createdAt: "desc" },
        });
    },

    async getById(id: string) {
        const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
        if (!order) throw new HttpError(404, "Orden de compra no encontrada");
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
        const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de compra no encontrada");
        if (existing.status === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada");

        const wasReceived = existing.status !== "RECEIVED" && dto.status === "RECEIVED";
        // Cancelar una orden ya recibida debe retirar del inventario lo que entró con ella.
        const beingCancelled = existing.status === "RECEIVED" && dto.status === "CANCELLED";

        const orderData = {
            ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
        };

        // Sin recepción ni cancelación de una recepción: actualización simple de campos / estado.
        if (!wasReceived && !beingCancelled) {
            return prisma.purchaseOrder.update({
                where: { id },
                data: { ...orderData, ...(dto.status !== undefined && { status: dto.status }) },
                include: ORDER_INCLUDE,
            });
        }

        // Cancelación de una orden recibida: se revierte el incremento de stock en una sola
        // transacción. El decremento es condicional (stock >= cantidad) para no dejar stock
        // negativo si esas unidades ya salieron por una venta; en ese caso se rechaza entera.
        if (beingCancelled) {
            return prisma.$transaction(async (tx) => {
                const items = await tx.purchaseOrderItem.findMany({
                    where: { purchaseOrderId: id, productId: { not: null } },
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
                            `No se puede cancelar: las unidades recibidas de "${item.product.name}" ya se consumieron. Disponible: ${item.product.stock}, requerido: ${item.quantity}`,
                        );
                    }

                    const refreshed = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            type: "OUT",
                            delta: -item.quantity,
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
            });
        }

        // Recepción: el cambio de estado y el incremento atómico de stock de cada producto
        // vinculado ocurren en una sola transacción (todo o nada).
        return prisma.$transaction(async (tx) => {
            const items = await tx.purchaseOrderItem.findMany({
                where: { purchaseOrderId: id, productId: { not: null } },
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
                        note: `Orden de compra #${id.slice(0, 8)}`,
                    },
                });
            }

            return tx.purchaseOrder.update({
                where: { id },
                data: { ...orderData, status: "RECEIVED" },
                include: ORDER_INCLUDE,
            });
        });
    },

    async delete(id: string) {
        const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de compra no encontrada");
        if (existing.status === "RECEIVED") throw new HttpError(400, "No se puede eliminar una orden ya recibida");

        await prisma.purchaseOrder.delete({ where: { id } });
    },

    async exportAll() {
        const orders = await prisma.purchaseOrder.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                supplier: { select: { name: true } },
                items: { include: { product: { select: { sku: true } } } },
            },
        });

        const rows: Record<string, unknown>[] = [];
        for (const o of orders) {
            for (const item of o.items) {
                rows.push({
                    orderId: o.id,
                    status: o.status,
                    supplierName: o.supplier?.name ?? "",
                    createdAt: o.createdAt.toISOString(),
                    productName: item.productName,
                    productSku: item.product?.sku ?? "",
                    quantity: item.quantity,
                    unitPrice: Number(item.unitPrice),
                    totalLine: item.quantity * Number(item.unitPrice),
                });
            }
        }
        return rows;
    },
};
