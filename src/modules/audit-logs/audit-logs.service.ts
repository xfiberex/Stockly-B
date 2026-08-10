import { prisma } from "@/shared/lib/prisma";
import { parsePagination } from "@/shared/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";

export type AuditAction =
    | "CREATE" | "UPDATE" | "DELETE" | "RESTORE"
    | "STOCK_MOVEMENT" | "BULK_STOCK"
    | "ORDER_RECEIVE" | "ORDER_CANCEL"
    | "USER_ROLE_CHANGE" | "USER_ACTIVATE" | "USER_DEACTIVATE"
    | "SALE_SHIP" | "SALE_CANCEL"
    // T2-31: reuso de un refresh token ya rotado. Es el único que no lo provoca una
    // acción del usuario sino una anomalía, y por eso se registra sin actor conocido.
    | "REFRESH_REUSE";

export type AuditEntity = "Product" | "PurchaseOrder" | "SaleOrder" | "User" | "Tag" | "Category" | "Brand" | "Supplier";

export interface AuditContext {
    userId?: string;
    userEmail?: string;
}

export const auditService = {
    async log(
        ctx: AuditContext,
        action: AuditAction,
        entity: AuditEntity,
        entityId?: string,
        details?: Record<string, unknown>,
    ) {
        try {
            await prisma.auditLog.create({
                data: {
                    userId: ctx.userId ?? null,
                    userEmail: ctx.userEmail ?? null,
                    action,
                    entity,
                    entityId: entityId ?? null,
                    ...(details !== undefined && { details: details as Prisma.InputJsonObject }),
                },
            });
        } catch {
            // Audit logging must never break the main flow
        }
    },

    async getAll(query: { page?: string; limit?: string; entity?: string; action?: string; userId?: string }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });

        const where = {
            ...(query.entity && { entity: query.entity }),
            ...(query.action && { action: query.action }),
            ...(query.userId && { userId: query.userId }),
        };

        const [logs, total] = await prisma.$transaction([
            prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
            prisma.auditLog.count({ where }),
        ]);

        return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },
};
