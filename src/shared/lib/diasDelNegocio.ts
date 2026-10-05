import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";

/**
 * T6-01 — días del negocio como filtro de un listado.
 *
 * Un día del negocio (`AAAA-MM-DD`) no es un día UTC: en Santo Domingo, las 23:30 del día 5 son
 * las 03:30 del día 6 en la columna. El informe por periodo lo resuelve dentro de su SQL con
 * `AT TIME ZONE` (`reports.service.ts`, `extremos`); un listado que es un `findMany` no tiene
 * SQL donde ponerlo, así que aquí se le pregunta a PostgreSQL **lo mismo** y se devuelven los
 * instantes, que es lo que entiende el `where` de Prisma. Se le pregunta a él y no se calcula con
 * `Intl` para que las dos pantallas no puedan discrepar sobre cuándo empieza un día con cambio
 * de hora.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-02-30` casa con el patrón y no existe; `Date.UTC` lo pasaría a marzo sin avisar. */
export function fechaValida(campo: string, valor: unknown): string {
    const existe = (texto: string) => {
        const [y, m, d] = texto.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === texto;
    };
    if (typeof valor !== "string" || !FECHA.test(valor) || !existe(valor)) {
        throw new HttpError(
            400,
            `El filtro «${campo}» no es una fecha válida: «${String(valor)}». Formato esperado: AAAA-MM-DD.`,
            "INVALID_FILTER_VALUE",
        );
    }
    return valor;
}

/**
 * El rango `from`–`to`, los dos incluidos y los dos opcionales, como condición sobre una columna
 * de fecha: `gte` es la medianoche de `from` en la zona del negocio y `lt` la del día
 * **siguiente** a `to`, para que el último día entre entero. Sin ninguno de los dos, `undefined`
 * y ninguna consulta.
 */
export async function rangoDeDias(
    query: { from?: unknown; to?: unknown },
    zona: string,
): Promise<{ gte?: Date; lt?: Date } | undefined> {
    // Un filtro vacío (`?from=`) es un filtro que no se puso, como en `filtroDeEnum`.
    const from = query.from === undefined || query.from === "" ? null : fechaValida("from", query.from);
    const to = query.to === undefined || query.to === "" ? null : fechaValida("to", query.to);
    if (!from && !to) return undefined;
    if (from && to && from > to) {
        throw new HttpError(400, `El rango empieza (${from}) después de terminar (${to}).`, "INVALID_FILTER_VALUE");
    }

    const [{ desde, hasta }] = await prisma.$queryRaw<Array<{ desde: Date | null; hasta: Date | null }>>`
        SELECT ((${from}::date::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC') AS desde,
               (((${to}::date + 1)::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC') AS hasta`;

    return { ...(desde && { gte: desde }), ...(hasta && { lt: hasta }) };
}
