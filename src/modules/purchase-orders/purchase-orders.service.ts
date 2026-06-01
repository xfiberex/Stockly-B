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

        const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: {
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
                ...(dto.status !== undefined && { status: dto.status }),
            },
            include: ORDER_INCLUDE,
        });

        // Al marcar como RECEIVED, incrementa stock de cada producto vinculado
        if (wasReceived) {
            const items = await prisma.purchaseOrderItem.findMany({
                where: { purchaseOrderId: id, productId: { not: null } },
            });

            await Promise.all(
                items.map(async (item) => {
                    if (!item.productId) return;
                    const product = await prisma.product.findUnique({ where: { id: item.productId } });
                    if (!product) return;

                    const newStock = product.stock + item.quantity;
                    await prisma.$transaction([
                        prisma.product.update({ where: { id: item.productId }, data: { stock: newStock } }),
                        prisma.stockMovement.create({
                            data: {
                                productId: item.productId,
                                type: "IN",
                                delta: item.quantity,
                                stockAfter: newStock,
                                note: `Orden de compra #${id.slice(0, 8)}`,
                            },
                        }),
                    ]);
                }),
            );
        }

        return updated;
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
