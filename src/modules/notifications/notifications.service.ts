import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { logger } from "@/shared/lib/logger";
import { hoyEn } from "@/shared/lib/zonaHoraria";
import { diasDeAvisoDeCaducidad } from "@/shared/lib/lotes";
import { settingsService } from "@/modules/settings/settings.service";
import type { Aviso } from "@/contratos/api";

/** Cuántos enseña la campana. No hay página siguiente: es lo último que ha pasado, no un archivo. */
const MOSTRADOS = 30;

/** Un aviso **leído** se guarda este tiempo. Los que nadie ha leído no caducan. */
const DIAS_DE_LEIDOS = 90;

/**
 * Cada cuánto, como mucho, se hace el mantenimiento. El backend no tiene planificador (ver
 * T5-11), así que va a lomos de la consulta del contador, que llega sola cada minuto por
 * pestaña abierta; este tope es lo que evita hacerlo en todas.
 */
const PAUSA_DE_MANTENIMIENTO = 5 * 60 * 1000;
let ultimoMantenimiento = 0;

/**
 * Un instante para una columna `timestamp` **sin zona**, que es como Prisma guarda las fechas:
 * en UTC. `now()` a secas se convertiría con la zona de la sesión de PostgreSQL —la del
 * servidor, que no tiene por qué ser UTC— y el aviso saldría con horas de desfase.
 */
const enUtc = (instante: Date) => Prisma.sql`(${instante.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** Los huecos del texto de cada tipo, tal como los fija `avisoSchema` en el contrato. */
type DatosDe<T extends Aviso["type"]> = Extract<Aviso, { type: T }>["data"];

/**
 * Deja un aviso a cada administrador activo —menos a `excepto`, si lo hay—.
 *
 * Una sola sentencia y no «buscar los administradores y crear»: el índice único decide si el
 * aviso es nuevo o es **el mismo que vuelve**, y entonces se reabre —sin leer, con las cifras
 * y la fecha de ahora— en vez de apilarse otro. Un producto que baja cinco veces en una
 * mañana es una línea en la campana, no cinco.
 */
async function avisarAAdministradores<T extends Aviso["type"]>(
    tipo: T,
    entityId: string,
    datos: DatosDe<T>,
    excepto?: string,
): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO "notifications" ("id", "userId", "type", "entityId", "data", "createdAt")
        SELECT gen_random_uuid(), u."id", ${tipo}::"NotificationType", ${entityId}, ${JSON.stringify(datos)}::jsonb, ${enUtc(new Date())}
        FROM "users" u
        WHERE u."role" = 'ADMIN' AND u."isActive" AND u."id" IS DISTINCT FROM ${excepto ?? null}::text
        ON CONFLICT ("userId", "type", "entityId")
        DO UPDATE SET "data" = EXCLUDED."data", "readAt" = NULL, "createdAt" = EXCLUDED."createdAt"`;
}

async function sinLeerDe(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
}

export const notificationsService = {
    /** Los últimos avisos del usuario, del más reciente al más antiguo, y cuántos tiene sin leer. */
    async getAll(userId: string) {
        const [items, unread] = await Promise.all([
            prisma.notification.findMany({
                where: { userId },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: MOSTRADOS,
                select: { id: true, type: true, entityId: true, data: true, readAt: true, createdAt: true },
            }),
            sinLeerDe(userId),
        ]);
        return { items, unread };
    },

    async unreadCount(userId: string) {
        return { unread: await sinLeerDe(userId) };
    },

    /**
     * `updateMany` con el `userId` en el `where`: el aviso de otro usuario no se marca ni se
     * distingue de uno que no existe. Marcar dos veces no es un error ni mueve la fecha.
     */
    async markRead(userId: string, id: string) {
        const propio = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
        if (!propio) throw new HttpError(404, "Aviso no encontrado", "NOTIFICATION_NOT_FOUND");

        await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
        return { unread: await sinLeerDe(userId) };
    },

    async markAllRead(userId: string) {
        await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
        return { unread: 0 };
    },

    /** El producto quedó en su mínimo o por debajo. Se avisa **esté o no activado el correo**. */
    async avisarStockBajo(producto: { id: string; name: string; stock: number; minStock: number }): Promise<void> {
        await avisarAAdministradores("LOW_STOCK", producto.id, {
            productName: producto.name,
            stock: producto.stock,
            minStock: producto.minStock,
        });
    },

    /**
     * Alguien intentó enviar la venta y no había stock. A quien lo intentó no se le avisa: ya
     * tiene el error delante. Se avisa a los demás administradores, que son quienes pueden
     * comprar lo que falta —y quien envía suele ser el almacén, que no puede—.
     */
    async avisarVentaSinStock(
        saleOrderId: string,
        falta: { orderNumber: number; productName: string; available: number; required: number },
        actorId?: string,
    ): Promise<void> {
        await avisarAAdministradores("SALE_UNSHIPPABLE", saleOrderId, falta, actorId);
    },

    /**
     * Lo que no dispara ninguna petición: avisar de las compras que pasaron su plazo y purgar
     * los avisos leídos hace más de 90 días.
     *
     * - **Compras atrasadas**, con el criterio del resumen semanal (T5-11): abierta, y pasado
     *   el plazo de su proveedor —o el de Configuración— desde el día en que se pidió, en días
     *   del negocio. `DO NOTHING` y no `DO UPDATE`: una orden sigue atrasada mañana, y reabrir
     *   su aviso cada cinco minutos lo haría imposible de marcar como leído.
     * - **Lotes que caducan** (T5-15): cada lote con existencias cuya fecha cae dentro del plazo
     *   de aviso —o ya pasó—. `DO NOTHING` por lo mismo: se avisa **una vez**, cuando entra en
     *   el plazo, y no cada cinco minutos hasta que se venda.
     * - **La purga** solo toca los leídos. Si la orden sigue atrasada cuando su aviso se
     *   purga, vuelve a avisarse: tres meses después, sigue siendo verdad.
     */
    async mantener(ahora: Date = new Date()): Promise<void> {
        const zona = String(await settingsService.get("timezone"));
        const plazoPorDefecto = Number(await settingsService.get("defaultLeadTimeDays"));
        const hoy = hoyEn(zona, ahora);

        await prisma.$executeRaw`
            INSERT INTO "notifications" ("id", "userId", "type", "entityId", "data", "createdAt")
            SELECT gen_random_uuid(), u."id", 'PURCHASE_OVERDUE'::"NotificationType", a."id",
                   jsonb_build_object('supplierName', a.proveedor, 'dueDate', to_char(a.vence, 'YYYY-MM-DD')), ${enUtc(ahora)}
            FROM (
                SELECT po."id", s."name" AS proveedor,
                       (po."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zona})::date
                           + COALESCE(s."leadTimeDays", ${plazoPorDefecto}::int) AS vence
                FROM "purchase_orders" po
                LEFT JOIN "suppliers" s ON s."id" = po."supplierId"
                WHERE po."status" IN ('PENDING', 'PARTIALLY_RECEIVED')
            ) a
            CROSS JOIN "users" u
            WHERE a.vence < ${hoy}::date AND u."role" = 'ADMIN' AND u."isActive"
            ON CONFLICT ("userId", "type", "entityId") DO NOTHING`;

        const diasDeAviso = await diasDeAvisoDeCaducidad();
        await prisma.$executeRaw`
            INSERT INTO "notifications" ("id", "userId", "type", "entityId", "data", "createdAt")
            SELECT gen_random_uuid(), u."id", 'LOT_EXPIRING'::"NotificationType", c."id",
                   jsonb_build_object('productName', c.producto, 'lotCode', c."code",
                                      'expiresAt', to_char(c."expiresAt", 'YYYY-MM-DD'), 'units', c.unidades), ${enUtc(ahora)}
            FROM (
                SELECT l."id", l."code", l."expiresAt", p."name" AS producto, SUM(sl."stock")::int AS unidades
                FROM "lots" l
                JOIN "stock_levels" sl ON sl."lotId" = l."id"
                JOIN "products" p ON p."id" = l."productId"
                WHERE sl."stock" > 0 AND l."expiresAt" <= ${hoy}::date + ${diasDeAviso}::int
                GROUP BY l."id", p."name"
            ) c
            CROSS JOIN "users" u
            WHERE u."role" = 'ADMIN' AND u."isActive"
            ON CONFLICT ("userId", "type", "entityId") DO NOTHING`;

        const limite = new Date(ahora.getTime() - DIAS_DE_LEIDOS * 86_400_000);
        await prisma.notification.deleteMany({ where: { readAt: { lt: limite } } });
    },

    /**
     * El mantenimiento, si toca. Se **espera** —el contador que se devuelve a continuación ya
     * cuenta lo que acabe de generarse— pero no puede tumbar la consulta que lo trae: un
     * fallo aquí se registra y la campana sigue funcionando con lo que haya.
     */
    async mantenerSiToca(): Promise<void> {
        if (Date.now() - ultimoMantenimiento < PAUSA_DE_MANTENIMIENTO) return;
        // Antes de esperar: dos consultas que lleguen juntas no lo lanzan dos veces.
        ultimoMantenimiento = Date.now();

        try {
            await notificationsService.mantener();
        } catch (err) {
            logger.warn({ err }, "No se pudo hacer el mantenimiento de los avisos");
        }
    },

    /** Para los tests: que el siguiente `mantenerSiToca` no se salte por haber corrido hace poco. */
    olvidarMantenimiento(): void {
        ultimoMantenimiento = 0;
    },
};
