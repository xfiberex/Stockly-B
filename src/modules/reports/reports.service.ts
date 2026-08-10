import { prisma } from "@/shared/lib/prisma";

// Forma del resumen que consumen tanto el JSON como el generador de PDF.
export type ReportSummary = Awaited<ReturnType<typeof reportsService.getSummary>>;

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
            // Movimientos agrupados por mes (últimos 6 meses)
            prisma.$queryRaw<Array<{ month: string; type: string; total: bigint }>>`
                SELECT
                    TO_CHAR("createdAt", 'YYYY-MM') AS month,
                    type,
                    COUNT(*) AS total
                FROM stock_movements
                WHERE "createdAt" >= NOW() - INTERVAL '6 months'
                GROUP BY month, type
                ORDER BY month ASC
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
            // Métricas de rotación: unidades OUT por producto en los últimos 30 días
            prisma.$queryRaw<Array<{ productId: string; productName: string; sku: string | null; totalOut: bigint; currentStock: number; minStock: number }>>`
                SELECT
                    p.id AS "productId",
                    p.name AS "productName",
                    p.sku,
                    COALESCE(SUM(CASE WHEN sm.type = 'OUT' THEN ABS(sm.delta) ELSE 0 END), 0) AS "totalOut",
                    p.stock AS "currentStock",
                    p."minStock"
                FROM products p
                LEFT JOIN stock_movements sm
                    ON sm."productId" = p.id
                    AND sm."createdAt" >= NOW() - INTERVAL '30 days'
                    AND sm.type = 'OUT'
                WHERE p."isActive" = true
                GROUP BY p.id, p.name, p.sku, p.stock, p."minStock"
                ORDER BY "totalOut" DESC
                LIMIT 20
            `,
        ]);

        // Un `GROUP BY` sin filas no devuelve ninguna, así que la fila de totales sí
        // existe siempre (es un agregado sin agrupación) pero conviene no darla por hecha.
        const inventoryValue = Number(totalesDeInventario[0]?.inventoryValue ?? 0);
        const lowStockCount = Number(totalesDeInventario[0]?.lowStockCount ?? 0);

        // Calcular métricas de rotación y proyección
        const rotationMetrics = stockMetrics.map((m) => {
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
