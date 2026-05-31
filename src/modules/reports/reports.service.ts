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
        ] = await Promise.all([
            prisma.product.count(),
            prisma.product.count({ where: { isActive: true } }),
            prisma.product.findMany({
                where: { isActive: true },
                select: { id: true, name: true, sku: true, price: true, stock: true, minStock: true, category: { select: { name: true } } },
            }),
            // Top 10 productos por valor total (stock × precio)
            prisma.product.findMany({
                where: { isActive: true },
                orderBy: [{ stock: "desc" }],
                take: 10,
                select: { id: true, name: true, sku: true, price: true, stock: true },
            }),
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
            // Productos con stock bajo (stock <= minStock, vía raw)
            prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; stock: number; minStock: number; categoryName: string | null }>>`
                SELECT p.id, p.name, p.sku, p.stock, p."minStock",
                       c.name AS "categoryName"
                FROM products p
                LEFT JOIN categories c ON c.id = p."categoryId"
                WHERE p."isActive" = true AND p.stock <= p."minStock"
                ORDER BY p.stock ASC
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
        };
    },
};
