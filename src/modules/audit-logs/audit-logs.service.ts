import { prisma } from "@/shared/lib/prisma";
import { parsePagination } from "@/shared/lib/pagination";
import { $Enums, type Prisma } from "@/generated/prisma/client";
import { filtroDeEnum } from "@/shared/lib/enums";

// T3-02 — los valores viven en `schema.prisma` y se importan de ahí. Antes se declaraban
// aquí como uniones y en la base como `String`: dos listas sin nada que las obligara a
// coincidir, y ningún error si dejaban de hacerlo. Ahora añadir una acción es tocar el
// enum y migrar; olvidarlo lo detecta `tsc`, no la producción.
//
// (`REFRESH_REUSE`, de T2-31, es el único que no lo provoca una acción del usuario sino
// una anomalía; por eso se registra sin actor conocido.)
export type AuditAction = $Enums.AuditAction;
export type AuditEntity = $Enums.AuditEntity;

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
            // El registro de auditoría nunca debe romper el flujo principal
        }
    },

    async getAll(query: { page?: string; limit?: string; entity?: string; action?: string; userId?: string }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });

        const entity = filtroDeEnum($Enums.AuditEntity, query.entity, "entity");
        const action = filtroDeEnum($Enums.AuditAction, query.action, "action");

        const where = {
            ...(entity && { entity }),
            ...(action && { action }),
            ...(query.userId && { userId: query.userId }),
        };

        const [logs, total] = await prisma.$transaction([
            prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
            prisma.auditLog.count({ where }),
        ]);

        return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },
};
