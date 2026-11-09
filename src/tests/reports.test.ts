import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto } from "./helpers";

const BASE = "/api/v1/reports";

describe("Reports API", () => {
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        // AUD-009 — los importes solo le llegan a ADMIN: las cifras de abajo se piden como ADMIN, y
        // lo que ven los demás roles tiene su bloque al final.
        const user = await createUser({ email: "reports_user@example.com", role: "ADMIN" });
        userCookie = getAuthCookie(user.id);

        // p1: valor 50, con una salida reciente (para métricas de rotación)
        const p1 = await crearProducto({ data: { name: "Disco SSD", price: 5, stock: 10, minStock: 0 } });
        // p2: valor 20, en stock bajo (stock <= minStock)
        await crearProducto({ data: { name: "RAM", price: 20, stock: 1, minStock: 5 } });

        await prisma.stockMovement.create({
            data: { productId: p1.id, type: "OUT", delta: -3, stockAfter: 7, warehouseId: ALMACEN, warehouseStockAfter: 7, note: "venta de prueba" },
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
            const caro = await crearProducto({
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
            const inactivo = await crearProducto({
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

    // -----------------------------------------------------------------------
    describe("AUD-009 — los importes del negocio, solo para ADMIN", () => {
        const IMPORTES_DE_TOTALES = ["inventoryValue", "inventoryCostValue", "potentialMargin"];
        const LISTAS_CON_IMPORTE = ["topByValue", "salesByDay", "topSold", "margin"];

        it.each(["USER", "WAREHOUSE", "SELLER"] as const)("%s recibe el resumen sin ningún importe", async (role) => {
            const otro = await createUser({ email: `reports_rol_${role.toLowerCase()}@example.com`, role });
            const res = await request(app).get(BASE).set("Cookie", getAuthCookie(otro.id));

            expect(res.status).toBe(200);
            const { totals, stockByCategory } = res.body.data;
            for (const campo of IMPORTES_DE_TOTALES) expect(totals).not.toHaveProperty(campo);
            for (const campo of LISTAS_CON_IMPORTE) expect(res.body.data).not.toHaveProperty(campo);
            for (const categoria of stockByCategory) expect(categoria).not.toHaveProperty("value");
            // Lo que no es importe sigue igual para todos.
            expect(totals.lowStockCount).toBe(1);
            expect(stockByCategory.length).toBeGreaterThan(0);
            expect(res.body.data.lowStockProducts).toHaveLength(1);
        });

        it("ADMIN los sigue recibiendo todos", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);

            for (const campo of IMPORTES_DE_TOTALES) expect(res.body.data.totals).toHaveProperty(campo);
            for (const campo of LISTAS_CON_IMPORTE) expect(res.body.data).toHaveProperty(campo);
            expect(res.body.data.stockByCategory[0]).toHaveProperty("value");
        });

        it("el PDF de quien no es ADMIN sale, y sin importes", async () => {
            const otro = await createUser({ email: "reports_pdf_user@example.com", role: "USER" });
            const res = await request(app)
                .get(`${BASE}?format=pdf`)
                .set("Cookie", getAuthCookie(otro.id))
                .buffer(true)
                .parse((r, cb) => {
                    const trozos: Buffer[] = [];
                    r.on("data", (c: Buffer) => trozos.push(c));
                    r.on("end", () => cb(null, Buffer.concat(trozos)));
                });

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toMatch(/application\/pdf/);
            // pdfkit comprime el texto; lo que se comprueba aquí es que se genera sin romper.
            expect((res.body as Buffer).length).toBeGreaterThan(1000);
        });
    });

    // -----------------------------------------------------------------------
    describe("AUD-010 — GET /reports/attention: «Necesita atención» en una petición", () => {
        it("401 sin sesión", async () => {
            const res = await request(app).get(`${BASE}/attention`);
            expect(res.status).toBe(401);
        });

        it("cada cifra es la de su lista filtrada, y la lee cualquier rol", async () => {
            const almacen = await createUser({ email: "attention_wh@example.com", role: "WAREHOUSE" });
            const cookie = getAuthCookie(almacen.id);

            const res = await request(app).get(`${BASE}/attention`).set("Cookie", cookie);
            expect(res.status).toBe(200);
            const a = res.body.data;

            // Los listados traen `meta` arriba; el informe de caducidades, dentro de `data`.
            const lista = async (ruta: string) => {
                const { body } = await request(app).get(ruta).set("Cookie", cookie);
                return (body.meta ?? body.data.meta).total;
            };
            expect(a.lowStock.total).toBe(await lista("/api/v1/products?lowStock=true&limit=1"));
            expect(a.lowStock.products.map((p: { name: string }) => p.name)).toEqual(["RAM"]);
            expect(a.expiring.total).toBe(await lista(`${BASE}/expiring?limit=1`));
            expect(a.openCounts).toBe(await lista("/api/v1/inventory-counts?status=OPEN&limit=1"));
            expect(a.purchasesToReceive).toBe(await lista("/api/v1/purchase-orders?status=PENDING,PARTIALLY_RECEIVED&limit=1"));
            expect(a.pendingSales).toBe(await lista("/api/v1/sale-orders?status=PENDING&limit=1"));
            expect(a.expiring.days).toEqual(expect.any(Number));
            expect(a.expiring.first).toBeNull();
        });

        it("cuenta las compras pendientes y parciales, no las recibidas", async () => {
            const admin = await createUser({ email: "attention_admin@example.com", role: "ADMIN" });
            const cookie = getAuthCookie(admin.id);
            const antes = (await request(app).get(`${BASE}/attention`).set("Cookie", cookie)).body.data.purchasesToReceive;

            await prisma.purchaseOrder.createMany({
                data: (["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const).map((status) => ({ status, warehouseId: ALMACEN })),
            });

            const despues = (await request(app).get(`${BASE}/attention`).set("Cookie", cookie)).body.data.purchasesToReceive;
            expect(despues).toBe(antes + 2);
        });
    });
});
