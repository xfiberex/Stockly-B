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
});
