import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

// Mock de Cloudinary y multer para no depender de conexión externa en tests
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

const SAMPLE_PRODUCT = {
    name: 'Monitor LG 27"',
    description: "Monitor Full HD 27 pulgadas",
    price: 299.99,
    stock: 15,
    category: "Electrónica",
};

describe("Products API", () => {
    let authCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const user = await createUser({ email: "products_user@example.com", role: "ADMIN" });
        authCookie = getAuthCookie(user.id);
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
            const res = await request(app).post(BASE).send(SAMPLE_PRODUCT);
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
                .send(SAMPLE_PRODUCT);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                name: SAMPLE_PRODUCT.name,
                category: SAMPLE_PRODUCT.category,
                isActive: true,
            });
            expect(res.body.data.id).toBeDefined();
        });

        it("422: faltan campos obligatorios (sin precio ni categoría)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto incompleto" });

            expect(res.status).toBe(422);
            expect(res.body.errors).toBeDefined();
        });

        it("422: categoría inválida", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ ...SAMPLE_PRODUCT, category: "Deportes" });

            expect(res.status).toBe(422);
        });

        it("422: precio negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ ...SAMPLE_PRODUCT, price: -50 });

            expect(res.status).toBe(422);
        });

        it("422: stock negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ ...SAMPLE_PRODUCT, stock: -1 });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products", () => {
        beforeAll(async () => {
            await prisma.product.createMany({
                data: [
                    { name: "Teclado Mecánico", price: 89.99, stock: 30, category: "Periféricos", isActive: true },
                    { name: "Mouse Gamer", price: 45.0, stock: 50, category: "Periféricos", isActive: true },
                    { name: "Auriculares Sony", price: 120.0, stock: 10, category: "Audio", isActive: false },
                ],
            });
        });

        it("200: devuelve lista paginada con meta", async () => {
            const res = await request(app).get(BASE).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.data)).toBe(true);
            expect(res.body.data.meta).toMatchObject({
                page: 1,
                limit: 10,
            });
            expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
        });

        it("200: filtra por categoría", async () => {
            const res = await request(app)
                .get(`${BASE}?category=Periféricos`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const products = res.body.data.data as Array<{ category: string }>;
            expect(products.length).toBeGreaterThanOrEqual(2);
            products.forEach((p) => expect(p.category).toBe("Periféricos"));
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
            expect(res.body.data.meta.page).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products/:id", () => {
        let productId: string;

        beforeAll(async () => {
            const p = await prisma.product.create({
                data: { name: "Producto para buscar por ID", price: 99, stock: 5, category: "Accesorios" },
            });
            productId = p.id;
        });

        it("200: devuelve producto por id", async () => {
            const res = await request(app)
                .get(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(productId);
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
                data: { name: "Para actualizar", price: 100, stock: 10, category: "Otros" },
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

        it("422: categoría inválida en actualización", async () => {
            const res = await request(app)
                .put(`${BASE}/${productId}`)
                .set("Cookie", authCookie)
                .send({ category: "Categoría Falsa" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("DELETE /products/:id", () => {
        let productId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para eliminar", price: 50, stock: 5, category: "Otros", isActive: true },
            });
            productId = p.id;
        });

        it("200: soft delete — isActive pasa a false", async () => {
            const res = await request(app)
                .delete(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

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
        it("200: devuelve array de productos con campos de exportación", async () => {
            const res = await request(app).get(`${BASE}/export`).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);

            const first = res.body.data[0];
            expect(first).toHaveProperty("name");
            expect(first).toHaveProperty("price");
            expect(first).toHaveProperty("stock");
            expect(first).toHaveProperty("category");
            expect(first).toHaveProperty("isActive");
            expect(first).not.toHaveProperty("id");
            expect(first).not.toHaveProperty("imagePublicId");
        });

        it("401: sin cookie", async () => {
            const res = await request(app).get(`${BASE}/export`);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /products/import", () => {
        it("201: importa múltiples productos válidos", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({
                    products: [
                        { name: "Producto Import A", price: 99.99, stock: 10, category: "Electrónica" },
                        { name: "Producto Import B", price: 49.99, stock: 5, category: "Audio" },
                    ],
                });

            expect(res.status).toBe(201);
            expect(res.body.data.created).toBe(2);
            expect(res.body.data.errors).toHaveLength(0);

            // Limpia movimientos y productos importados (FK constraint)
            const imported = await prisma.product.findMany({ where: { name: { startsWith: "Producto Import" } } });
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

        it("422: producto con categoría inválida es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({
                    products: [{ name: "Producto malo", price: 10, category: "Deportes" }],
                });

            expect(res.status).toBe(422);
        });

        it("422: producto sin precio es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({
                    products: [{ name: "Sin precio", category: "Audio" }],
                });

            expect(res.status).toBe(422);
        });

        it("401: sin cookie", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .send({ products: [{ name: "X", price: 10, category: "Audio" }] });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("PATCH /products/:id/restore", () => {
        let inactiveId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para restaurar", price: 50, stock: 5, category: "Otros", isActive: false },
            });
            inactiveId = p.id;
        });

        it("200: restaura producto inactivo — isActive pasa a true", async () => {
            const res = await request(app)
                .patch(`${BASE}/${inactiveId}/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.isActive).toBe(true);
        });

        it("400: producto ya activo", async () => {
            const active = await prisma.product.create({
                data: { name: "Ya activo", price: 50, stock: 5, category: "Otros", isActive: true },
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
