import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/reports";

describe("Reports API", () => {
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const user = await createUser({ email: "reports_user@example.com", role: "USER" });
        userCookie = getAuthCookie(user.id);

        // p1: valor 50, con una salida reciente (para métricas de rotación)
        const p1 = await prisma.product.create({ data: { name: "Disco SSD", price: 5, stock: 10, minStock: 0 } });
        // p2: valor 20, en stock bajo (stock <= minStock)
        await prisma.product.create({ data: { name: "RAM", price: 20, stock: 1, minStock: 5 } });

        await prisma.stockMovement.create({
            data: { productId: p1.id, type: "OUT", delta: -3, stockAfter: 7, note: "venta de prueba" },
        });
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("401: GET /reports sin cookie", async () => {
        const res = await request(app).get(BASE);
        expect(res.status).toBe(401);
    });

    it("devuelve el resumen con KPIs correctos", async () => {
        const res = await request(app).get(BASE).set("Cookie", userCookie);
        expect(res.status).toBe(200);

        const { totals } = res.body.data;
        expect(totals.totalProducts).toBe(2);
        expect(totals.activeProducts).toBe(2);
        expect(totals.inventoryValue).toBe(70); // 5*10 + 20*1
        expect(totals.lowStockCount).toBe(1); // solo RAM (stock 1 <= minStock 5)
    });

    it("incluye los productos en stock bajo", async () => {
        const res = await request(app).get(BASE).set("Cookie", userCookie);
        const low = res.body.data.lowStockProducts;
        expect(low).toHaveLength(1);
        expect(low[0].name).toBe("RAM");
    });

    it("calcula métricas de rotación a partir de las salidas", async () => {
        const res = await request(app).get(BASE).set("Cookie", userCookie);
        const metric = res.body.data.stockMetrics.find((m: { productName: string }) => m.productName === "Disco SSD");
        expect(metric).toBeDefined();
        expect(metric.totalOutLast30Days).toBe(3);
        expect(metric.dailyVelocity).toBeCloseTo(0.1, 5);
    });

    it("expone stockByCategory y topByValue como arrays", async () => {
        const res = await request(app).get(BASE).set("Cookie", userCookie);
        expect(Array.isArray(res.body.data.stockByCategory)).toBe(true);
        expect(Array.isArray(res.body.data.topByValue)).toBe(true);
    });

    it("descarga el reporte en PDF", async () => {
        const res = await request(app).get(`${BASE}?format=pdf`).set("Cookie", userCookie);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    });

    // T2-02: el valor de inventario, el recuento de stock bajo y el desglose por
    // categoría se calculaban recorriendo en JavaScript **todo** el catálogo activo, y
    // pasaron a un `GROUP BY` con `SUM` y `COUNT(*) FILTER`. Los tests de arriba ya
    // cubren las cifras; estos cubren los bordes que el bucle de JavaScript resolvía de
    // formas fáciles de perder al traducir a SQL.
    describe("agregados en SQL (T2-02)", () => {
        it("los productos sin categoría se agrupan bajo «Sin categoría»", async () => {
            // Los dos productos del `beforeAll` no tienen categoría: el `LEFT JOIN` deja
            // el nombre a NULL y el `COALESCE` reproduce la etiqueta que ponía el bucle.
            const res = await request(app).get(BASE).set("Cookie", userCookie);

            const sinCategoria = res.body.data.stockByCategory.find((c: { name: string }) => c.name === "Sin categoría");
            expect(sinCategoria).toMatchObject({ stock: 11, value: 70 });
        });

        it("las categorías vienen ordenadas por valor descendente", async () => {
            const categoria = await prisma.category.create({ data: { name: "T202-Cara" } });
            const caro = await prisma.product.create({
                data: { name: "T202-caro", price: 1000, stock: 5, minStock: 0, categoryId: categoria.id },
            });

            const res = await request(app).get(BASE).set("Cookie", userCookie);
            const valores = res.body.data.stockByCategory.map((c: { value: number }) => c.value);

            // Antes el orden lo daba el recorrido del `findMany`, o sea el que quisiera
            // la base: dos llamadas seguidas podían pintar el gráfico distinto.
            expect(valores).toEqual([...valores].sort((a: number, b: number) => b - a));
            expect(res.body.data.stockByCategory[0]).toMatchObject({ name: "T202-Cara", value: 5000 });

            await prisma.product.delete({ where: { id: caro.id } });
            await prisma.category.delete({ where: { id: categoria.id } });
        });

        it("los productos inactivos no cuentan para el valor ni para el desglose", async () => {
            const inactivo = await prisma.product.create({
                data: { name: "T202-inactivo", price: 999, stock: 99, minStock: 500, isActive: false },
            });

            const res = await request(app).get(BASE).set("Cookie", userCookie);

            // El `WHERE "isActive" = true` va ahora dentro de cada agregado; si se
            // olvidara en uno de los dos, este producto lo desviaría todo.
            expect(res.body.data.totals.inventoryValue).toBe(70);
            expect(res.body.data.totals.lowStockCount).toBe(1);
            expect(res.body.data.totals.totalProducts).toBe(3);
            expect(res.body.data.totals.activeProducts).toBe(2);
            const stockTotal = res.body.data.stockByCategory.reduce((s: number, c: { stock: number }) => s + c.stock, 0);
            expect(stockTotal).toBe(11);

            await prisma.product.delete({ where: { id: inactivo.id } });
        });
    });
});
