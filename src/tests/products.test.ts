import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    uploadToCloudinary: jest.fn().mockResolvedValue({
        url: "https://res.cloudinary.com/test/image/upload/v1/test.jpg",
        publicId: "test/test",
    }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: {
        single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    },
}));

const BASE = "/api/v1/products";

describe("Products API", () => {
    let authCookie: string;
    let categoryId: string;

    beforeAll(async () => {
        await cleanDb();
        const user = await createUser({ email: "products_user@example.com", role: "ADMIN" });
        authCookie = getAuthCookie(user.id);

        // Crear categoría de test para usar en todos los productos
        const category = await prisma.category.create({ data: { name: "Electrónica" } });
        categoryId = category.id;
    });

    afterAll(async () => {
        await cleanDb();
    });

    // -----------------------------------------------------------------------
    describe("Guardia de autenticación", () => {
        it("401: GET /products sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("401: POST /products sin cookie", async () => {
            const res = await request(app).post(BASE).send({ name: "X", price: 10 });
            expect(res.status).toBe(401);
        });

        it("401: DELETE /products/:id sin cookie", async () => {
            const res = await request(app).delete(`${BASE}/some-id`);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /products", () => {
        it("201: crea producto con campos válidos", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: 'Monitor LG 27"', description: "Monitor Full HD", price: 299.99, stock: 15, categoryId });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({ name: 'Monitor LG 27"', isActive: true });
            expect(res.body.data.category).toMatchObject({ id: categoryId, name: "Electrónica" });
            expect(res.body.data.id).toBeDefined();
        });

        it("201: crea producto sin categoría (categoryId opcional)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto sin categoría", price: 10 });

            expect(res.status).toBe(201);
            expect(res.body.data.category).toBeNull();
        });

        it("422: faltan campos obligatorios (sin precio)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto incompleto" });

            expect(res.status).toBe(422);
            expect(res.body.errors).toBeDefined();
        });

        it("422: categoryId no es UUID válido", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: 10, categoryId: "no-es-uuid" });

            expect(res.status).toBe(422);
        });

        it("422: precio negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: -50 });

            expect(res.status).toBe(422);
        });

        it("422: stock negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: 10, stock: -1 });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products", () => {
        beforeAll(async () => {
            const perifericos = await prisma.category.create({ data: { name: "Periféricos" } });
            const audio = await prisma.category.create({ data: { name: "Audio" } });

            await prisma.product.createMany({
                data: [
                    { name: "Teclado Mecánico", price: 89.99, stock: 30, categoryId: perifericos.id, isActive: true },
                    { name: "Mouse Gamer", price: 45.0, stock: 50, categoryId: perifericos.id, isActive: true },
                    { name: "Auriculares Sony", price: 120.0, stock: 10, categoryId: audio.id, isActive: false },
                ],
            });
        });

        it("200: devuelve lista paginada con meta", async () => {
            const res = await request(app).get(BASE).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.data)).toBe(true);
            expect(res.body.data.meta).toMatchObject({ page: 1, limit: 10 });
            expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
        });

        it("200: filtra por categoryId", async () => {
            const perifericosId = (await prisma.category.findUnique({ where: { name: "Periféricos" } }))!.id;

            const res = await request(app)
                .get(`${BASE}?categoryId=${perifericosId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const products = res.body.data.data as Array<{ category: { name: string } }>;
            expect(products.length).toBeGreaterThanOrEqual(2);
            products.forEach((p) => expect(p.category.name).toBe("Periféricos"));
        });

        it("200: filtra por búsqueda de texto", async () => {
            const res = await request(app)
                .get(`${BASE}?search=Teclado`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const names = (res.body.data.data as Array<{ name: string }>).map((p) => p.name);
            expect(names.some((n) => n.includes("Teclado"))).toBe(true);
        });

        it("200: filtra productos inactivos con isActive=false", async () => {
            const res = await request(app)
                .get(`${BASE}?isActive=false`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const products = res.body.data.data as Array<{ isActive: boolean }>;
            products.forEach((p) => expect(p.isActive).toBe(false));
        });

        it("200: pagina resultados correctamente", async () => {
            const res = await request(app)
                .get(`${BASE}?page=1&limit=2`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data.length).toBeLessThanOrEqual(2);
            expect(res.body.data.meta.limit).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products/:id", () => {
        let productId: string;

        beforeAll(async () => {
            const p = await prisma.product.create({
                data: { name: "Producto para buscar por ID", price: 99, stock: 5, categoryId },
            });
            productId = p.id;
        });

        it("200: devuelve producto con relaciones incluidas", async () => {
            const res = await request(app)
                .get(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(productId);
            expect(res.body.data.category).toMatchObject({ name: "Electrónica" });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /products/:id", () => {
        let productId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para actualizar", price: 100, stock: 10, categoryId },
            });
            productId = p.id;
        });

        it("200: actualiza nombre y precio", async () => {
            const res = await request(app)
                .put(`${BASE}/${productId}`)
                .set("Cookie", authCookie)
                .send({ name: "Nombre Actualizado", price: 199 });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Nombre Actualizado");
            expect(parseFloat(res.body.data.price)).toBe(199);
        });

        it("404: producto inexistente", async () => {
            const res = await request(app)
                .put(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie)
                .send({ name: "Actualizado" });

            expect(res.status).toBe(404);
        });

        it("422: categoryId inválido en actualización", async () => {
            const res = await request(app)
                .put(`${BASE}/${productId}`)
                .set("Cookie", authCookie)
                .send({ categoryId: "no-es-uuid" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("DELETE /products/:id", () => {
        let productId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para eliminar", price: 50, stock: 5, categoryId, isActive: true },
            });
            productId = p.id;
        });

        it("200: soft delete — isActive pasa a false", async () => {
            const res = await request(app)
                .delete(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const deleted = await prisma.product.findUnique({ where: { id: productId } });
            expect(deleted?.isActive).toBe(false);
        });

        it("404: producto inexistente", async () => {
            const res = await request(app)
                .delete(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products/export", () => {
        it("200: devuelve array con campos de exportación incluyendo nombres de relaciones", async () => {
            const res = await request(app).get(`${BASE}/export`).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);

            const first = res.body.data[0];
            expect(first).toHaveProperty("name");
            expect(first).toHaveProperty("price");
            expect(first).toHaveProperty("stock");
            expect(first).toHaveProperty("categoryName");
            expect(first).not.toHaveProperty("id");
        });

        it("401: sin cookie", async () => {
            const res = await request(app).get(`${BASE}/export`);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /products/import", () => {
        it("201: importa productos usando nombre de categoría", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({
                    products: [
                        { name: "Producto Import A", price: 99.99, stock: 10, categoryName: "Electrónica" },
                        { name: "Producto Import B", price: 49.99, stock: 5 },
                    ],
                });

            expect(res.status).toBe(201);
            expect(res.body.data.created).toBe(2);
            expect(res.body.data.errors).toHaveLength(0);

            const imported = await prisma.product.findMany({ where: { name: { startsWith: "Producto Import" } } });
            // El primero debe tener la categoría resuelta
            const withCategory = imported.find((p) => p.name === "Producto Import A");
            expect(withCategory?.categoryId).toBe(categoryId);

            await prisma.stockMovement.deleteMany({ where: { productId: { in: imported.map((p) => p.id) } } });
            await prisma.product.deleteMany({ where: { name: { startsWith: "Producto Import" } } });
        });

        it("422: array vacío es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({ products: [] });

            expect(res.status).toBe(422);
        });

        it("422: producto sin precio es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({ products: [{ name: "Sin precio" }] });

            expect(res.status).toBe(422);
        });

        it("401: sin cookie", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .send({ products: [{ name: "X", price: 10 }] });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("PATCH /products/:id/restore", () => {
        let inactiveId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para restaurar", price: 50, stock: 5, categoryId, isActive: false },
            });
            inactiveId = p.id;
        });

        it("200: restaura producto inactivo", async () => {
            const res = await request(app)
                .patch(`${BASE}/${inactiveId}/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.isActive).toBe(true);
        });

        it("400: producto ya activo", async () => {
            const active = await prisma.product.create({
                data: { name: "Ya activo", price: 50, stock: 5, categoryId, isActive: true },
            });

            const res = await request(app)
                .patch(`${BASE}/${active.id}/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(400);
            await prisma.product.delete({ where: { id: active.id } });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .patch(`${BASE}/00000000-0000-0000-0000-000000000000/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });
});
