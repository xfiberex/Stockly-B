import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, crearProducto, numeroDeVenta, ALMACEN } from "./helpers";

/**
 * AUD-008 — lo que el panel necesita de la API para que cada cifra lleve a una lista que diga
 * lo mismo: los filtros de los listados de destino, el número real de categorías y el orden de
 * «Reponer primero».
 */
describe("El panel de hoy (AUD-008)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "panel_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);

        const bebidas = await prisma.category.create({ data: { name: "Bebidas" } });
        await prisma.category.create({ data: { name: "Vacía" } });

        // Stock bajo: dos con mínimo y la misma falta relativa (4/5 y 8/10), uno agotado con
        // mínimo y uno agotado sin mínimo. Más uno sobrado, que no entra.
        await crearProducto({ data: { name: "Leche", price: 1, stock: 4, minStock: 5, costPrice: 0.5, categoryId: bebidas.id } });
        await crearProducto({ data: { name: "Agua", price: 1, stock: 8, minStock: 10, costPrice: 0.5, categoryId: bebidas.id } });
        await crearProducto({ data: { name: "Zumo", price: 1, stock: 0, minStock: 10, costPrice: 0.5 } });
        await crearProducto({ data: { name: "Sin mínimo", price: 1, stock: 0, minStock: 0, costPrice: 0.5 } });
        // Sin coste: con stock entra; sin stock no (no cuenta en ningún importe).
        await crearProducto({ data: { name: "Sobrado sin coste", price: 1, stock: 50, minStock: 5 } });
        await crearProducto({ data: { name: "Agotado sin coste", price: 1, stock: 0, minStock: 0 } });
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("GET /reports", () => {
        it("cuenta las categorías del catálogo, no los grupos de stock (que incluyen «Sin categoría»)", async () => {
            const res = await request(app).get("/api/v1/reports").set("Cookie", cookie);

            expect(res.status).toBe(200);
            expect(res.body.data.totals.categoryCount).toBe(2);
            expect(res.body.data.stockByCategory.map((c: { name: string }) => c.name)).toContain("Sin categoría");
        });

        it("«Reponer primero» va por la falta frente al mínimo y deja al final los que no tienen mínimo", async () => {
            const res = await request(app).get("/api/v1/reports").set("Cookie", cookie);

            const nombres = res.body.data.lowStockProducts.map((p: { name: string }) => p.name);
            expect(nombres).toEqual(["Zumo", "Leche", "Agua", "Agotado sin coste", "Sin mínimo"]);
        });
    });

    describe("GET /products", () => {
        const nombres = (res: request.Response) => res.body.data.data.map((p: { name: string }) => p.name).sort();

        it("`lowStock=true` trae los mismos productos que cuenta el panel", async () => {
            const [lista, resumen] = await Promise.all([
                request(app).get("/api/v1/products?lowStock=true&limit=50").set("Cookie", cookie),
                request(app).get("/api/v1/reports").set("Cookie", cookie),
            ]);

            expect(lista.status).toBe(200);
            expect(nombres(lista)).toEqual(["Agotado sin coste", "Agua", "Leche", "Sin mínimo", "Zumo"]);
            expect(lista.body.data.meta.total).toBe(resumen.body.data.totals.lowStockCount);
        });

        it("`withoutCost=true` trae los que tienen stock y no tienen coste, como el aviso del panel", async () => {
            const [lista, resumen] = await Promise.all([
                request(app).get("/api/v1/products?withoutCost=true").set("Cookie", cookie),
                request(app).get("/api/v1/reports").set("Cookie", cookie),
            ]);

            expect(nombres(lista)).toEqual(["Sobrado sin coste"]);
            expect(lista.body.data.meta.total).toBe(resumen.body.data.totals.productsWithoutCost);
        });

        it("los dos filtros juntos se suman", async () => {
            const res = await request(app).get("/api/v1/products?lowStock=true&withoutCost=true").set("Cookie", cookie);

            expect(res.body.data.meta.total).toBe(0);
        });
    });

    describe("GET /purchase-orders", () => {
        beforeAll(async () => {
            for (const status of ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const) {
                await prisma.purchaseOrder.create({ data: { warehouseId: ALMACEN, status } });
            }
        });

        it("acepta varios estados separados por comas: «por recibir» son pendientes y parciales", async () => {
            const res = await request(app).get("/api/v1/purchase-orders?status=PENDING,PARTIALLY_RECEIVED").set("Cookie", cookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data.map((o: { status: string }) => o.status).sort()).toEqual(["PARTIALLY_RECEIVED", "PENDING"]);
        });

        it("ignora los estados que no existen y se queda con los que sí", async () => {
            const res = await request(app).get("/api/v1/purchase-orders?status=INVENTADO,RECEIVED").set("Cookie", cookie);

            expect(res.body.data.meta.total).toBe(1);
        });
    });

    describe("GET /sale-orders", () => {
        beforeAll(async () => {
            for (const email of ["vendedor@example.com", "Vendedor@Example.com", "otra@example.com"]) {
                await prisma.saleOrder.create({ data: { warehouseId: ALMACEN, number: await numeroDeVenta(), createdByEmail: email } });
            }
        });

        it("`createdByEmail` trae las de quien las registró, sin distinguir mayúsculas", async () => {
            const res = await request(app).get("/api/v1/sale-orders?createdByEmail=VENDEDOR@example.com").set("Cookie", cookie);

            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(2);
        });

        it("vacío no filtra", async () => {
            const res = await request(app).get("/api/v1/sale-orders?createdByEmail=").set("Cookie", cookie);

            expect(res.body.data.meta.total).toBe(3);
        });
    });
});
