import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/config/env";
import { logger } from "@/shared/lib/logger";
import { hoyEn } from "@/shared/lib/zonaHoraria";
import { sendWeeklyDigestEmail } from "@/shared/lib/nodemailer";
import { settingsService } from "@/modules/settings/settings.service";

/**
 * T5-11 — el resumen semanal por correo.
 *
 * **El backend no tiene planificador**, y no se le pone uno: dentro del proceso, el correo
 * saldría una vez por réplica en cuanto hubiera más de una. Esto lo lanza un comando
 * (`src/cli/resumen-semanal.ts`) que se programa desde fuera, como la copia de seguridad.
 *
 * Lo que sí es responsabilidad de aquí es que **lanzarlo de más no mande de más**: la semana se
 * reclama con una fila de `weekly_digests`, cuyo `weekStart` es único.
 */

const MOSTRADOS = { masVendido: 5, stockBajo: 10, pendientes: 5, comprasAtrasadas: 5 } as const;

/**
 * Cuánto se da por viva una ejecución que no ha terminado. Pasado esto se supone que murió a
 * medias y la siguiente la retoma; antes, se la deja acabar para no mandar dos veces lo mismo.
 */
const MINUTOS_EN_CURSO = 15;

export interface Semana {
    /** Lunes, `AAAA-MM-DD`. */
    from: string;
    /** Domingo, `AAAA-MM-DD`. */
    to: string;
}

export interface DatosDelResumen extends Semana {
    /** La zona del negocio, para fechar en ella las órdenes que se listan. */
    zona: string;
    /** Lo **enviado** en la semana, por fecha de envío: el mismo criterio que los informes (T5-09). */
    ventas: { ordenes: number; unidades: number; importe: number };
    masVendido: Array<{ nombre: string; unidades: number; importe: number }>;
    /** Estos tres son **de hoy**, no de la semana: es lo que sigue pidiendo que alguien haga algo. */
    stockBajo: { total: number; productos: Array<{ nombre: string; stock: number; minimo: number }> };
    pendientes: { total: number; ordenes: Array<{ id: string; fecha: Date; importe: number }> };
    comprasAtrasadas: { total: number; ordenes: Array<{ id: string; proveedor: string | null; diasDeRetraso: number }> };
}

export type ResultadoDelResumen =
    /** El ajuste `weeklyDigestEnabled` está apagado. */
    | { estado: "desactivado" }
    /** No hay ningún ADMIN activo y verificado. */
    | { estado: "sin-destinatarios" }
    /** A todos los administradores les llegó ya el de esta semana. */
    | ({ estado: "ya-enviado" } & Semana)
    /** Otra ejecución la está enviando ahora mismo. */
    | ({ estado: "en-curso" } & Semana)
    | ({ estado: "enviado"; enviados: number; fallidos: number } & Semana);

const aTexto = (fecha: Date) => fecha.toISOString().slice(0, 10);

/**
 * La semana natural **completa** anterior a `hoy` (`AAAA-MM-DD`, en la zona del negocio): de
 * lunes a domingo. Da igual qué día se lance el comando: el lunes y el jueves resumen la misma
 * semana, y por eso el segundo no manda nada.
 */
export function semanaAnterior(hoy: string): Semana {
    const [anio, mes, dia] = hoy.split("-").map(Number);
    const fecha = new Date(Date.UTC(anio!, mes! - 1, dia!));
    // `getUTCDay()` cuenta desde el domingo; `(d + 6) % 7` son los días que han pasado desde el lunes.
    const desdeElLunes = (fecha.getUTCDay() + 6) % 7;
    const lunesDeEstaSemana = fecha.getTime() - desdeElLunes * 86_400_000;

    return {
        from: aTexto(new Date(lunesDeEstaSemana - 7 * 86_400_000)),
        to: aTexto(new Date(lunesDeEstaSemana - 86_400_000)),
    };
}

/** Todo lo que cuenta el correo, reunido **una vez** para todos los destinatarios. */
export async function reunirDatosDelResumen(semana: Semana, zona: string, hoy: string): Promise<DatosDelResumen> {
    // Los extremos de la semana como instantes UTC, igual que en `reports.service.ts` (T5-09):
    // el lunes a las 00:00 **de la zona del negocio**, no de UTC.
    const desde = Prisma.sql`((${semana.from}::date::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`;
    const hasta = Prisma.sql`(((${semana.to}::date + 1)::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`;
    const enviadasEnLaSemana = Prisma.sql`so."status" = 'SHIPPED' AND so."shippedAt" >= ${desde} AND so."shippedAt" < ${hasta}`;

    const plazoPorDefecto = Number(await settingsService.get("defaultLeadTimeDays"));

    const [totales, masVendido, stockBajo, totalPendientes, pendientes, compras] = await Promise.all([
        prisma.$queryRaw<Array<{ ordenes: bigint; unidades: bigint | null; importe: Prisma.Decimal | null }>>`
            SELECT COUNT(DISTINCT so."id") AS ordenes, SUM(i."quantity") AS unidades, SUM(i."quantity" * i."unitPrice") AS importe
            FROM "sale_orders" so
            JOIN "sale_order_items" i ON i."saleOrderId" = so."id"
            WHERE ${enviadasEnLaSemana}
        `,
        // Por el nombre congelado en la línea: es lo que se vendió, aunque el producto se haya
        // renombrado o borrado después.
        prisma.$queryRaw<Array<{ nombre: string; unidades: bigint; importe: Prisma.Decimal }>>`
            SELECT i."productName" AS nombre, SUM(i."quantity") AS unidades, SUM(i."quantity" * i."unitPrice") AS importe
            FROM "sale_orders" so
            JOIN "sale_order_items" i ON i."saleOrderId" = so."id"
            WHERE ${enviadasEnLaSemana}
            GROUP BY i."productName"
            ORDER BY unidades DESC, importe DESC, nombre ASC
            LIMIT ${MOSTRADOS.masVendido}
        `,
        // El mismo criterio que el panel de reportes: activos con el stock en el mínimo o por debajo.
        prisma.$queryRaw<Array<{ nombre: string; stock: number; minimo: number; total: bigint }>>`
            SELECT p."name" AS nombre, p."stock", p."minStock" AS minimo, COUNT(*) OVER () AS total
            FROM "products" p
            WHERE p."isActive" = true AND p."stock" <= p."minStock"
            ORDER BY (p."stock" - p."minStock") ASC, p."name" ASC
            LIMIT ${MOSTRADOS.stockBajo}
        `,
        prisma.saleOrder.count({ where: { status: "PENDING" } }),
        prisma.saleOrder.findMany({
            where: { status: "PENDING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: MOSTRADOS.pendientes,
            select: { id: true, createdAt: true, items: { select: { quantity: true, unitPrice: true } } },
        }),
        // Fuera de plazo: abierta, y pasado el plazo de entrega de su proveedor —o el de
        // Configuración si no tiene— desde el día en que se pidió, contado en días del negocio.
        prisma.$queryRaw<Array<{ id: string; proveedor: string | null; retraso: number; total: bigint }>>`
            WITH abiertas AS (
                SELECT po."id", s."name" AS proveedor,
                       (${hoy}::date - ((po."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zona})::date
                           + COALESCE(s."leadTimeDays", ${plazoPorDefecto}::int)))::int AS retraso
                FROM "purchase_orders" po
                LEFT JOIN "suppliers" s ON s."id" = po."supplierId"
                WHERE po."status" IN ('PENDING', 'PARTIALLY_RECEIVED')
            )
            SELECT "id", proveedor, retraso, COUNT(*) OVER () AS total
            FROM abiertas
            WHERE retraso > 0
            ORDER BY retraso DESC, "id" ASC
            LIMIT ${MOSTRADOS.comprasAtrasadas}
        `,
    ]);

    return {
        ...semana,
        zona,
        ventas: {
            ordenes: Number(totales[0]?.ordenes ?? 0),
            unidades: Number(totales[0]?.unidades ?? 0),
            importe: Number(totales[0]?.importe ?? 0),
        },
        masVendido: masVendido.map((p) => ({ nombre: p.nombre, unidades: Number(p.unidades), importe: Number(p.importe) })),
        stockBajo: {
            total: Number(stockBajo[0]?.total ?? 0),
            productos: stockBajo.map((p) => ({ nombre: p.nombre, stock: p.stock, minimo: p.minimo })),
        },
        pendientes: {
            total: totalPendientes,
            ordenes: pendientes.map((o) => ({
                id: o.id,
                fecha: o.createdAt,
                importe: o.items.reduce((suma, i) => suma + i.quantity * Number(i.unitPrice), 0),
            })),
        },
        comprasAtrasadas: {
            total: Number(compras[0]?.total ?? 0),
            ordenes: compras.map((o) => ({ id: o.id, proveedor: o.proveedor, diasDeRetraso: o.retraso })),
        },
    };
}

/**
 * Reclama la semana para esta ejecución y devuelve a quién le llegó ya, o `null` si la tiene otra.
 *
 * La primera vez la gana quien consigue **crear** la fila: el índice único decide entre dos que
 * lo intentan a la vez. Las siguientes —un reintento tras un fallo, o un administrador nuevo—
 * la retoman solo si la anterior terminó o lleva demasiado sin terminar, y eso también es una
 * sola sentencia (`updateMany` con la condición dentro), no un «leer y luego escribir».
 */
async function reclamarSemana(semana: Semana, ahora: Date): Promise<{ id: string; yaEnviados: string[] } | null> {
    try {
        const fila = await prisma.weeklyDigest.create({
            data: { weekStart: semana.from, weekEnd: semana.to, startedAt: ahora },
        });
        return { id: fila.id, yaEnviados: [] };
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }

    const caducada = new Date(ahora.getTime() - MINUTOS_EN_CURSO * 60_000);
    const { count } = await prisma.weeklyDigest.updateMany({
        where: { weekStart: semana.from, OR: [{ finishedAt: { not: null } }, { startedAt: { lt: caducada } }] },
        data: { startedAt: ahora, finishedAt: null },
    });
    if (count === 0) return null;

    const fila = await prisma.weeklyDigest.findUniqueOrThrow({ where: { weekStart: semana.from } });
    return { id: fila.id, yaEnviados: fila.sentToUserIds };
}

/**
 * Envía el resumen de la semana anterior a los administradores a los que aún no les ha llegado.
 *
 * Cada envío se anota **en cuanto sale**, no al final: si el proceso muere a mitad, la siguiente
 * ejecución sabe a quién le llegó y no se lo repite. `ahora` se puede fijar para los tests.
 */
export async function enviarResumenSemanal(ahora: Date = new Date()): Promise<ResultadoDelResumen> {
    if (!(await settingsService.get("weeklyDigestEnabled"))) return { estado: "desactivado" };

    const zona = await settingsService.zonaHoraria();
    const hoy = hoyEn(zona, ahora);
    const semana = semanaAnterior(hoy);

    // T4-12: `idioma` en el `select`, como en la alerta de stock. No hay petición de la que deducirlo.
    const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true, isVerified: true },
        select: { id: true, email: true, name: true, idioma: true },
        orderBy: { email: "asc" },
    });
    if (admins.length === 0) return { estado: "sin-destinatarios" };

    // Antes de reclamar la semana: sin SMTP no hay nada que enviar, y una fila reclamada para
    // nada haría esperar a la ejecución que sí pudiera.
    if (!env.smtp.configured) {
        throw new Error("El resumen semanal está activado, pero el envío de correo no está configurado (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM).");
    }

    const yaLlegoATodos = async () => {
        const fila = await prisma.weeklyDigest.findUnique({ where: { weekStart: semana.from } });
        return fila !== null && admins.every((a) => fila.sentToUserIds.includes(a.id));
    };
    // Lo normal en una segunda ejecución: ni se reclama ni se consulta nada más.
    if (await yaLlegoATodos()) return { estado: "ya-enviado", ...semana };

    const reclamo = await reclamarSemana(semana, ahora);
    if (!reclamo) return { estado: "en-curso", ...semana };

    const pendientes = admins.filter((a) => !reclamo.yaEnviados.includes(a.id));
    let enviados = 0;
    let fallidos = 0;

    try {
        const datos = await reunirDatosDelResumen(semana, zona, hoy);

        // En serie: son pocos destinatarios, y así un SMTP que limita el ritmo no rechaza la mitad.
        for (const admin of pendientes) {
            try {
                await sendWeeklyDigestEmail(admin.email, admin.name, datos, admin.idioma);
                await prisma.weeklyDigest.update({ where: { id: reclamo.id }, data: { sentToUserIds: { push: admin.id } } });
                enviados++;
            } catch (err) {
                fallidos++;
                logger.warn({ err, userId: admin.id }, "No se pudo enviar el resumen semanal");
            }
        }
    } finally {
        // También si reunir los datos falla: la semana queda libre para la siguiente ejecución.
        await prisma.weeklyDigest.update({ where: { id: reclamo.id }, data: { finishedAt: new Date() } });
    }

    return { estado: "enviado", enviados, fallidos, ...semana };
}
