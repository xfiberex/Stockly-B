import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { settingsService } from "@/modules/settings/settings.service";
import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";
import type { CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

const ORDER_INCLUDE = {
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

async function checkLowStockAlert(productId: string, productName: string, newStock: number, minStock: number) {
    if (newStock > minStock) return;
    const enabled = await settingsService.get("lowStockAlertEnabled");
    if (!enabled) return;

    const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true, isVerified: true },
        select: { email: true, name: true },
    });

    await Promise.allSettled(
        admins.map((admin) =>
            sendLowStockAlertEmail(admin.email, admin.name, productName, newStock, minStock),
        ),
    );
}

export const saleOrderService = {
    async getAll(query: { page?: string; limit?: string; status?: string }) {
        const page = Math.max(1, parseInt(query.page ?? "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
        const skip = (page - 1) * limit;

        const where = query.status ? { status: query.status } : {};

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

        const beingShipped = existing.status !== "SHIPPED" && dto.status === "SHIPPED";

        // When shipping: verify stock availability first
        if (beingShipped) {
            const items = await prisma.saleOrderItem.findMany({
                where: { saleOrderId: id, productId: { not: null } },
                include: { product: true },
            });

            for (const item of items) {
                if (!item.product) continue;
                if (item.product.stock < item.quantity) {
                    throw new HttpError(
                        400,
                        `Stock insuficiente para "${item.product.name}". Disponible: ${item.product.stock}, requerido: ${item.quantity}`,
                    );
                }
            }
        }

        const updated = await prisma.saleOrder.update({
            where: { id },
            data: {
                ...(dto.customerName !== undefined && { customerName: dto.customerName }),
                ...(dto.customerEmail !== undefined && { customerEmail: dto.customerEmail }),
                ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
                ...(dto.status !== undefined && { status: dto.status }),
            },
            include: ORDER_INCLUDE,
        });

        if (beingShipped) {
            const items = await prisma.saleOrderItem.findMany({
                where: { saleOrderId: id, productId: { not: null } },
                include: { product: true },
            });

            await Promise.all(
                items.map(async (item) => {
                    if (!item.productId || !item.product) return;
                    const newStock = item.product.stock - item.quantity;

                    await prisma.$transaction([
                        prisma.product.update({ where: { id: item.productId }, data: { stock: newStock } }),
                        prisma.stockMovement.create({
                            data: {
                                productId: item.productId,
                                type: "OUT",
                                delta: -item.quantity,
                                stockAfter: newStock,
                                note: `Orden de venta #${id.slice(0, 8)}`,
                            },
                        }),
                    ]);

                    await checkLowStockAlert(item.productId, item.product.name, newStock, item.product.minStock);
                }),
            );
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
