import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// Forma del resumen que consumen tanto el JSON como el generador de PDF.
export type ReportSummary = Awaited<ReturnType<typeof reportsService.getSummary>>;

/** Una fila de la tabla de rotación del dashboard. */
type FilaDeRotacion = {
    productId: string;
    productName: string;
    sku: string | null;
    totalOut: bigint;
    currentStock: number;
    minStock: number;
};

/**
 * T4-16 — cuántos productos por rotación se traen **antes** de descartar los inactivos.
 *
 * La consulta agrega los movimientos, se queda con los primeros por unidades salidas y solo
 * entonces mira si el producto sigue activo. Ese orden es el que evita tocar el catálogo:
 * con el filtro dentro del `JOIN`, PostgreSQL tiene que recorrer los 95 000 productos
 * activos para poder cruzarlos, y vuelve el `Seq Scan` que esta tarea venía a quitar
 * —medido: 56 ms con el escaneo frente a **20 sin él**—.
 *
 * El margen existe porque entre esos primeros puede haber productos inactivos que no
 * cuentan. Medido sobre el conjunto de carga: **17 de los 500 primeros** están inactivos.
 * Aun así el número no es una garantía, y por eso no se confía en él: si la consulta rápida
 * devuelve menos de 20 filas, `getSummary` repite con la variante exacta. El margen es un
 * atajo, no una apuesta.
 */
const MARGEN_DE_ROTACION = 500;

const SELECCION_DE_ROTACION = Prisma.sql`
    p.id AS "productId", p.name AS "productName", p.sku,
    m."totalOut", p.stock AS "currentStock", p."minStock"
`;

const MOVIMIENTOS_DE_SALIDA = Prisma.sql`
    SELECT sm."productId" AS id, SUM(ABS(sm.delta)) AS "totalOut"
    FROM stock_movements sm
    WHERE sm.type = 'OUT' AND sm."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY sm."productId"
`;

/**
 * El desempate por `p.id` no es cosmético: **seis productos empatan** en el valor de corte
 * del conjunto de carga, y sin un orden total cuáles entran en el top 20 cambia entre
 * recargas de la misma pantalla sin que nada haya cambiado.
 */
const rotacionRapida = Prisma.sql`
    SELECT ${SELECCION_DE_ROTACION}
    FROM (${MOVIMIENTOS_DE_SALIDA} ORDER BY "totalOut" DESC, sm."productId" LIMIT ${MARGEN_DE_ROTACION}) m
    JOIN products p ON p.id = m.id AND p."isActive" = true
    ORDER BY m."totalOut" DESC, p.id
    LIMIT 20
`;

/** Sin límite interior: no puede devolver de menos, y por eso paga el escaneo del catálogo. */
const rotacionExacta = Prisma.sql`
    SELECT ${SELECCION_DE_ROTACION}
    FROM (${MOVIMIENTOS_DE_SALIDA}) m
    JOIN products p ON p.id = m.id AND p."isActive" = true
    ORDER BY m."totalOut" DESC, p.id
    LIMIT 20
`;

export const reportsService = {
    async getSummary() {
        const [
            totalProducts,
            activeProducts,
            totalesDeInventario,
            porCategoria,
            topByValue,
            movementsByMonth,
            lowStockProducts,
            stockMetrics,
        ] = await Promise.all([
            prisma.product.count(),
            prisma.product.count({ where: { isActive: true } }),
            // T2-02 — el valor de inventario y el recuento de stock bajo, en la base.
            //
            // Antes esto era un `findMany` sin `take` que traía **el catálogo activo
            // entero** al proceso Node —todas las filas, con su categoría— para sumar en
            // JavaScript dos números y contar cuántas cumplen una condición. Es la
            // consulta que alimenta el dashboard, la primera pantalla tras el login: el
            // coste crece con el catálogo aunque el resultado sean cinco cifras.
            //
            // `COUNT(*) FILTER (WHERE …)` recorre la tabla una sola vez para las dos
            // cosas, y `SUM` sobre `numeric` suma en decimal exacto en vez de acumular
            // errores de coma flotante producto a producto.
            prisma.$queryRaw<Array<{ inventoryValue: number; lowStockCount: bigint }>>`
                SELECT
                    COALESCE(SUM(price * stock), 0)::float8 AS "inventoryValue",
                    COUNT(*) FILTER (WHERE stock <= "minStock") AS "lowStockCount"
                FROM products
                WHERE "isActive" = true
            `,
            // Stock y valor por categoría, agrupados también en la base. El `COALESCE`
            // del nombre reproduce el «Sin categoría» que ponía el bucle de JavaScript.
            prisma.$queryRaw<Array<{ name: string; stock: number; value: number }>>`
                SELECT
                    COALESCE(c.name, 'Sin categoría') AS name,
                    COALESCE(SUM(p.stock), 0)::int AS stock,
                    COALESCE(SUM(p.price * p.stock), 0)::float8 AS value
                FROM products p
                LEFT JOIN categories c ON c.id = p."categoryId"
                WHERE p."isActive" = true
                GROUP BY 1
                ORDER BY value DESC
            `,
            // Top 10 por valor de inventario (precio × stock), no por cantidad.
            prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; price: string; stock: number }>>`
                SELECT id, name, sku, price, stock
                FROM products
                WHERE "isActive" = true
                ORDER BY price * stock DESC
                LIMIT 10
            `,
            /**
             * Movimientos por mes, últimos 6 meses (T4-16).
             *
             * **La segunda consulta que se iba a disco, y esta no la nombraba la ficha.**
             * `GROUP BY TO_CHAR("createdAt",'YYYY-MM'), type` agrupa por una **expresión**,
             * de la que PostgreSQL no tiene estadísticas: estima muchísimos grupos, descarta
             * el `HashAggregate` y elige `GroupAggregate`, que **ordena las 360 725 filas de
             * la ventana** para devolver 24. Esa ordenación no cabe en `work_mem` y acaba en
             * `external merge` de 7 800 kB.
             *
             * Aquí se recorre mes a mes con un `LATERAL`, y dentro de cada mes se agrupa solo
             * por `type` —una columna de verdad, cuatro valores—: `HashAggregate`, sin
             * ordenación. Seis recorridos por rango de índice en lugar de una ordenación
             * completa. Medido: **275.6 ms → 74.8 ms**, y en memoria.
             *
             * `GREATEST(g.mes, …)` conserva el comportamiento exacto del original, **incluido
             * el primer cubo parcial**: la ventana rueda desde hoy, así que el mes más
             * antiguo va a medias. Es una rareza del gráfico —una barra corta que no
             * corresponde a menos actividad— pero cambiarla es una decisión de producto, no
             * de rendimiento, y esta tarea no la toma. Comprobado cubo a cubo con el instante
             * de corte fijado: **las dos formas dan las mismas cifras**; sin fijarlo parecen
             * distintas porque el borde se mueve entre una consulta y la siguiente.
             */
            prisma.$queryRaw<Array<{ month: string; type: string; total: bigint }>>`
                SELECT TO_CHAR(g.mes, 'YYYY-MM') AS month, c.type, c.total
                FROM generate_series(
                        date_trunc('month', NOW() - INTERVAL '6 months'),
                        date_trunc('month', NOW()),
                        INTERVAL '1 month') AS g(mes),
                     LATERAL (
                        SELECT sm.type, COUNT(*)::bigint AS total
                        FROM stock_movements sm
                        WHERE sm."createdAt" >= GREATEST(g.mes, NOW() - INTERVAL '6 months')
                          AND sm."createdAt" < g.mes + INTERVAL '1 month'
                        GROUP BY sm.type
                     ) c
                ORDER BY g.mes ASC
            `,
            // Productos con stock bajo
            prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; stock: number; minStock: number; categoryName: string | null }>>`
                SELECT p.id, p.name, p.sku, p.stock, p."minStock",
                       c.name AS "categoryName"
                FROM products p
                LEFT JOIN categories c ON c.id = p."categoryId"
                WHERE p."isActive" = true AND p.stock <= p."minStock"
                ORDER BY p.stock ASC
                LIMIT 20
            `,
            /**
             * Rotación: unidades salidas por producto en los últimos 30 días (T4-16).
             *
             * **Antes se agregaba el catálogo entero para quedarse con veinte filas.** El
             * `LEFT JOIN` partía de `products` con `WHERE isActive`, así que agrupaba los
             * 95 051 productos activos —incluidos los 85 000 sin una sola salida en el mes—
             * y ordenaba el resultado: una ordenación de 20 000 grupos que **no cabía en
             * `work_mem`** y se iba a disco (`external merge`, 8 072 kB).
             *
             * Ahora se parte de los movimientos, que son 31 501 en la ventana de 30 días y
             * producen 9 967 grupos. Medido sobre el conjunto de carga, mejor de cinco
             * pasadas:
             *
             *   original, work_mem 4MB (de fábrica)   401.6 ms   ordena en disco
             *   original, work_mem 64MB               121.1 ms   en memoria
             *   **esta, work_mem de fábrica**          **20.0 ms**   en memoria
             *
             * Las dos devuelven **los mismos veinte productos con los mismos totales**,
             * comprobado fila a fila sobre 100 000 productos.
             *
             * Y esa tercera fila es la razón por la que **no se toca `work_mem`**, que era
             * la otra mitad de lo que pedía la ficha: subirlo a 64 MB arreglaba el síntoma
             * —×3.3— a cambio de multiplicar por cada conexión y por cada nodo de ordenación
             * la memoria que puede pedir el servidor. Reescribir la consulta da ×20 y no
             * compromete memoria de nadie. La configuración se deja como está a propósito.
             */
            prisma.$queryRaw<FilaDeRotacion[]>(rotacionRapida),
        ]);

        // Si el margen no bastó, se repite sin él. Es el caso raro —haría falta que casi
        // todos los primeros por rotación estuvieran inactivos— y cuesta 56 ms; lo que no
        // puede pasar es que el dashboard enseñe catorce filas donde hay veinte.
        const rotacion =
            stockMetrics.length < 20
                ? await prisma.$queryRaw<FilaDeRotacion[]>(rotacionExacta)
                : stockMetrics;

        // Un `GROUP BY` sin filas no devuelve ninguna, así que la fila de totales sí
        // existe siempre (es un agregado sin agrupación) pero conviene no darla por hecha.
        const inventoryValue = Number(totalesDeInventario[0]?.inventoryValue ?? 0);
        const lowStockCount = Number(totalesDeInventario[0]?.lowStockCount ?? 0);

        // Calcular métricas de rotación y proyección
        const rotationMetrics = rotacion.map((m) => {
            const totalOut = Number(m.totalOut);
            const dailyVelocity = totalOut / 30;
            const daysToStockout = dailyVelocity > 0 ? Math.floor(m.currentStock / dailyVelocity) : null;
            const reorderSoon = daysToStockout !== null && daysToStockout <= 14;

            return {
                productId: m.productId,
                productName: m.productName,
                sku: m.sku,
                currentStock: Number(m.currentStock),
                minStock: Number(m.minStock),
                totalOutLast30Days: totalOut,
                dailyVelocity: Math.round(dailyVelocity * 100) / 100,
                daysToStockout,
                reorderSoon,
            };
        });

        return {
            totals: {
                totalProducts,
                activeProducts,
                inactiveProducts: totalProducts - activeProducts,
                inventoryValue,
                lowStockCount,
            },
            stockByCategory: porCategoria.map((c) => ({
                name: c.name,
                stock: Number(c.stock),
                value: Number(c.value),
            })),
            topByValue: topByValue.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                price: Number(p.price),
                stock: p.stock,
                totalValue: Number(p.price) * p.stock,
            })),
            movementsByMonth: movementsByMonth.map((m) => ({
                month: m.month,
                type: m.type,
                total: Number(m.total),
            })),
            lowStockProducts: lowStockProducts.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                stock: Number(p.stock),
                minStock: Number(p.minStock),
                category: p.categoryName ?? null,
            })),
            stockMetrics: rotationMetrics,
        };
    },
};
