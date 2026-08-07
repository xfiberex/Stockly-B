/**
 * Saneado de los parámetros de paginación que llegan por query string.
 *
 * `parseInt("abc")` devuelve `NaN` y `Math.max(1, NaN)` sigue siendo `NaN`; ese `NaN`
 * acababa en Prisma como `skip`/`take` y provocaba un 500. Aquí cualquier valor que no
 * sea un entero positivo cae al valor por defecto.
 */

export interface PaginationQuery {
    page?: string;
    limit?: string;
}

export interface PaginationOptions {
    /** Elementos por página cuando `limit` no viene o no es válido. */
    defaultLimit?: number;
    /** Techo de `limit`, para que nadie pida la tabla entera. */
    maxLimit?: number;
}

export interface Pagination {
    page: number;
    limit: number;
    skip: number;
}

/**
 * Techo de `page`. Sin él, `?page=99999999999999` genera un `skip` que desborda el
 * entero de 32 bits de PostgreSQL y vuelve a dar 500 por otra vía.
 */
const MAX_PAGE = 1_000_000;

/** Entero positivo o `undefined` si el valor no lo es (vacío, `NaN`, cero, negativo). */
function toPositiveInt(value?: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return parsed;
}

export function parsePagination(
    query: PaginationQuery,
    { defaultLimit = 10, maxLimit = 100 }: PaginationOptions = {},
): Pagination {
    const page = Math.min(MAX_PAGE, toPositiveInt(query.page) ?? 1);
    const limit = Math.min(maxLimit, toPositiveInt(query.limit) ?? defaultLimit);

    return { page, limit, skip: (page - 1) * limit };
}
