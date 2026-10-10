import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Lo **enviado** entre dos días del negocio, que es lo que cuenta como venta en los informes
 * (T5-09): por fecha de envío, no de creación, y nunca lo pendiente ni lo cancelado.
 *
 * Lo comparten el resumen semanal (T5-11) y el panel (T6-09). Los importes son **netos**:
 * `unitPrice` no lleva el impuesto (T6-05).
 */

/**
 * El filtro, para un `FROM "sale_orders" so`. `from` y `to` son días del negocio (`AAAA-MM-DD`),
 * los dos incluidos, y sus extremos son la medianoche **de la zona**, no la de UTC: una venta
 * enviada a las 23:30 en Santo Domingo ya es del día siguiente en UTC, y no por eso cambia de día.
 */
export function enviadasEntre(from: string, to: string, zona: string): Prisma.Sql {
    const desde = Prisma.sql`((${from}::date::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`;
    const hasta = Prisma.sql`(((${to}::date + 1)::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`;
    return Prisma.sql`so."status" = 'SHIPPED' AND so."shippedAt" >= ${desde} AND so."shippedAt" < ${hasta}`;
}

/** El día del negocio `dias` días antes de `dia` (`AAAA-MM-DD`). Aritmética de calendario, sin zona. */
export function haceDias(dia: string, dias: number): string {
    const [anio, mes, d] = dia.split("-").map(Number);
    return new Date(Date.UTC(anio!, mes! - 1, d! - dias)).toISOString().slice(0, 10);
}

export interface MasVendido {
    nombre: string;
    unidades: number;
    importe: number;
}

/**
 * Los productos más vendidos por unidades. Por el nombre congelado en la línea: es lo que se
 * vendió, aunque el producto se haya renombrado o borrado después.
 */
export async function masVendidoEntre(from: string, to: string, zona: string, limite: number): Promise<MasVendido[]> {
    const filas = await prisma.$queryRaw<Array<{ nombre: string; unidades: bigint; importe: Prisma.Decimal }>>`
        SELECT i."productName" AS nombre, SUM(i."quantity") AS unidades, SUM(i."quantity" * i."unitPrice") AS importe
        FROM "sale_orders" so
        JOIN "sale_order_items" i ON i."saleOrderId" = so."id"
        WHERE ${enviadasEntre(from, to, zona)}
        GROUP BY i."productName"
        ORDER BY unidades DESC, importe DESC, nombre ASC
        LIMIT ${limite}
    `;
    return filas.map((p) => ({ nombre: p.nombre, unidades: Number(p.unidades), importe: Number(p.importe) }));
}

export interface VentasDeUnDia {
    /** Día del negocio, `AAAA-MM-DD`. */
    day: string;
    orders: number;
    revenue: number;
}

/**
 * T6-09 — órdenes e importe de cada uno de los `dias` días del negocio que acaban en `hoy`.
 * **Un día sin ventas sale a cero, no falta.**
 *
 * No es un `GROUP BY` sobre el día. Agrupar por `("shippedAt" AT TIME ZONE …)::date` es agrupar
 * por una **expresión**, de la que PostgreSQL no tiene estadísticas: es lo que mandó a disco el
 * gráfico de movimientos por mes (T4-16, `docs/rendimiento.md` §5). Aquí, como allí, se genera
 * la serie de días y cada uno se suma en su `LATERAL`, por rango del índice `(status,
 * shippedAt)`. Y como un agregado sin `GROUP BY` devuelve siempre una fila, los días vacíos
 * salen solos, sin `LEFT JOIN` ni relleno en JavaScript.
 *
 * **El `::timestamp` de la serie no sobra.** Con argumentos `date`, `generate_series` devuelve
 * `timestamptz` en la zona de la sesión, y `AT TIME ZONE` sobre eso convierte en el sentido
 * contrario: el corte del día se iba a otra hora y la venta de las 23:30 cambiaba de día. `g.dia`
 * tiene que ser una medianoche **local sin zona**, como `g.mes` en el gráfico de movimientos.
 */
export async function ventasPorDia(hoy: string, dias: number, zona: string): Promise<VentasDeUnDia[]> {
    const filas = await prisma.$queryRaw<Array<{ day: string; orders: bigint; revenue: number }>>`
        SELECT TO_CHAR(g.dia, 'YYYY-MM-DD') AS day, c.orders, c.revenue
        FROM generate_series(
                ${hoy}::date::timestamp - make_interval(days => ${dias}::int - 1),
                ${hoy}::date::timestamp,
                INTERVAL '1 day') AS g(dia),
             LATERAL (
                SELECT COUNT(DISTINCT so."id") AS orders,
                       COALESCE(SUM(i."quantity" * i."unitPrice"), 0)::float8 AS revenue
                FROM "sale_orders" so
                LEFT JOIN "sale_order_items" i ON i."saleOrderId" = so."id"
                WHERE so."status" = 'SHIPPED'
                  AND so."shippedAt" >= (g.dia AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
                  AND so."shippedAt" < ((g.dia + INTERVAL '1 day') AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
             ) c
        ORDER BY g.dia ASC
    `;
    return filas.map((f) => ({ day: f.day, orders: Number(f.orders), revenue: Number(f.revenue) }));
}
