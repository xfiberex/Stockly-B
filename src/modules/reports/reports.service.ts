import { prisma } from "@/shared/lib/prisma";

export const reportsService = {
    async getSummary() {
        const [
            totalProducts,
            activeProducts,
            products,
            topByValue,
            movementsByMonth,
            lowStockProducts,
            stockMetrics,
        ] = await Promise.all([
            prisma.product.count(),
            prisma.product.count({ where: { isActive: true } }),
            prisma.product.findMany({
                where: { isActive: true },
                select: { id: true, name: true, sku: true, price: true, stock: true, minStock: true, category: { select: { name: true } } },
            }),
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

        const inventoryValue = products.reduce((sum, p) => sum + Number(p.price) * p.stock, 0);

        // Agrupar stock por categoría
        const stockByCategory: Record<string, number> = {};
        const valueByCategory: Record<string, number> = {};
        for (const p of products) {
            const cat = p.category?.name ?? "Sin categoría";
            stockByCategory[cat] = (stockByCategory[cat] ?? 0) + p.stock;
            valueByCategory[cat] = (valueByCategory[cat] ?? 0) + Number(p.price) * p.stock;
        }

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
            },
            stockByCategory: Object.entries(stockByCategory).map(([name, stock]) => ({ name, stock, value: valueByCategory[name] ?? 0 })),
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
