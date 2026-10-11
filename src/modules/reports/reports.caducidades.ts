import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { almacenDelFiltro } from "@/shared/lib/almacenes";
import { aDia, diasDeAvisoDeCaducidad, diasHasta, hoyDelNegocio } from "@/shared/lib/lotes";
import { DIAS_DE_AVISO_DE_CADUCIDAD_MAXIMOS, type Caducidad, type InformeDeCaducidades } from "@/contratos/api";

/**
 * T5-15 — el informe de caducidades: lo que **ya ha caducado** y sigue en el almacén, y lo que
 * caduca de hoy a dentro de `days` días, con su valor a coste.
 *
 * Una fila es lo que hay de un lote **en un almacén**: quien va a retirarlo necesita saber a qué
 * estantería ir. Los días se cuentan en la zona del negocio, como todo lo de los lotes, y los
 * dos extremos entran: con `days=7`, lo que vence hoy y lo que vence dentro de siete días.
 *
 * Paginado en la base (T4-15), con los totales calculados aparte sobre **todo** lo que cumple el
 * filtro: sumar la página que se ve daría una cifra que cambia al pasar de página.
 */

/** `days`, si viene: un entero entre 0 y el tope. Uno ilegible se rechaza, no se ignora. */
function diasDelFiltro(valor: unknown): number | undefined {
    if (valor === undefined || valor === "") return undefined;
    const dias = typeof valor === "string" && /^\d+$/.test(valor) ? Number(valor) : Number.NaN;
    if (!Number.isInteger(dias) || dias > DIAS_DE_AVISO_DE_CADUCIDAD_MAXIMOS) {
        const validos = `un entero entre 0 y ${DIAS_DE_AVISO_DE_CADUCIDAD_MAXIMOS}`;
        throw new HttpError(
            400,
            `El filtro «days» no admite el valor «${String(valor)}». Valores válidos: ${validos}.`,
            "INVALID_FILTER_VALUE",
            { campo: "days", valor: String(valor), validos },
        );
    }
    return dias;
}

interface Fila {
    lotId: string;
    code: string;
    expiresAt: Date;
    productId: string;
    productName: string;
    sku: string | null;
    warehouseId: string;
    warehouseName: string;
    stock: number;
    unitCost: number | null;
}

export const caducidadesService = {
    async informe(query: { days?: unknown; warehouseId?: unknown; page?: string; limit?: string }): Promise<InformeDeCaducidades> {
        const days = diasDelFiltro(query.days) ?? (await diasDeAvisoDeCaducidad());
        const warehouseId = await almacenDelFiltro(query.warehouseId);
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
        const hoy = await hoyDelNegocio();

        // Solo lo que hay: un lote agotado no deja fila en `stock_levels`. Y de todos los
        // productos, también los descatalogados: lo que caduca en la estantería caduca igual.
        const desde = Prisma.sql`
            FROM stock_levels sl
            JOIN lots l ON l.id = sl."lotId"
            JOIN products p ON p.id = sl."productId"
            JOIN warehouses w ON w.id = sl."warehouseId"
            WHERE sl.stock > 0 AND l."expiresAt" <= ${hoy}::date + ${days}::int
              ${warehouseId ? Prisma.sql`AND sl."warehouseId" = ${warehouseId}` : Prisma.empty}`;
        const caducado = Prisma.sql`l."expiresAt" < ${hoy}::date`;

        const [filas, [totales]] = await Promise.all([
            prisma.$queryRaw<Fila[]>`
                SELECT l.id AS "lotId", l.code, l."expiresAt", p.id AS "productId", p.name AS "productName", p.sku,
                       w.id AS "warehouseId", w.name AS "warehouseName", sl.stock, p."costPrice"::float8 AS "unitCost"
                ${desde}
                ORDER BY l."expiresAt", p.name, l.code, w.name, sl.id
                LIMIT ${limit} OFFSET ${skip}`,
            prisma.$queryRaw<Array<{ total: number } & InformeDeCaducidades["summary"]>>`
                SELECT COUNT(*)::int AS total,
                       COALESCE(SUM(sl.stock) FILTER (WHERE ${caducado}), 0)::int AS "expiredUnits",
                       COALESCE(SUM(sl.stock * p."costPrice") FILTER (WHERE ${caducado}), 0)::float8 AS "expiredCostValue",
                       COALESCE(SUM(sl.stock) FILTER (WHERE NOT ${caducado}), 0)::int AS "expiringUnits",
                       COALESCE(SUM(sl.stock * p."costPrice") FILTER (WHERE NOT ${caducado}), 0)::float8 AS "expiringCostValue",
                       COALESCE(SUM(sl.stock) FILTER (WHERE p."costPrice" IS NULL), 0)::int AS "unitsWithoutCost"
                ${desde}`,
        ]);
        const { total, ...summary } = totales!;

        const data: Caducidad[] = filas.map((f) => {
            const expiresAt = aDia(f.expiresAt);
            const daysLeft = diasHasta(expiresAt, hoy);
            return {
                ...f,
                expiresAt,
                daysLeft,
                expired: daysLeft < 0,
                // Redondeado a céntimos: es un importe que se lee, no uno con el que se sigue operando.
                costValue: f.unitCost === null ? null : Math.round(f.stock * f.unitCost * 100) / 100,
            };
        });

        return {
            today: hoy,
            days,
            summary: {
                ...summary,
                expiredCostValue: Math.round(summary.expiredCostValue * 100) / 100,
                expiringCostValue: Math.round(summary.expiringCostValue * 100) / 100,
            },
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },
};
