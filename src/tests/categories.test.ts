import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/categories";

describe("Categories API", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "cat_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "cat_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    afterEach(async () => {
        await prisma.category.deleteMany();
    });

    // -----------------------------------------------------------------------
    describe("GET /categories", () => {
        it("200: devuelve lista de categorías ordenada por nombre", async () => {
            await prisma.category.createMany({
                data: [{ name: "Electrónica" }, { name: "Audio" }],
            });

            const res = await request(app).get(BASE).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data[0].name).toBe("Audio"); // ordenado alfabéticamente
        });

        it("401: sin autenticación", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /categories", () => {
        it("201: ADMIN crea categoría", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Electrónica", description: "Dispositivos electrónicos" });

            expect(res.status).toBe(201);
            expect(res.body.data.name).toBe("Electrónica");
        });

        it("409: nombre duplicado", async () => {
            await prisma.category.create({ data: { name: "Electrónica" } });

            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Electrónica" });

            expect(res.status).toBe(409);
        });

        it("403: USER no puede crear categorías", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", userCookie)
                .send({ name: "Nueva" });

            expect(res.status).toBe(403);
        });

        it("422: nombre vacío", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /categories/:id", () => {
        let categoryId: string;

        beforeEach(async () => {
            const c = await prisma.category.create({ data: { name: "Original" } });
            categoryId = c.id;
        });

        it("200: actualiza nombre y descripción", async () => {
            const res = await request(app)
                .put(`${BASE}/${categoryId}`)
                .set("Cookie", adminCookie)
                .send({ name: "Actualizada", description: "Nueva descripción" });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Actualizada");
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .put(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", adminCookie)
                .send({ name: "Test" });

            expect(res.status).toBe(404);
        });

        it("409: nombre ya en uso por otra categoría", async () => {
            await prisma.category.create({ data: { name: "Ocupada" } });

            const res = await request(app)
                .put(`${BASE}/${categoryId}`)
                .set("Cookie", adminCookie)
                .send({ name: "Ocupada" });

            expect(res.status).toBe(409);
        });
    });

    // -----------------------------------------------------------------------
    describe("DELETE /categories/:id", () => {
        it("200: elimina categoría y pone categoryId=null en productos", async () => {
            const category = await prisma.category.create({ data: { name: "A eliminar" } });
            const product = await prisma.product.create({
                data: { name: "Prod con categoría", price: 10, stock: 1, categoryId: category.id },
            });

            const res = await request(app)
                .delete(`${BASE}/${category.id}`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(200);

            const updated = await prisma.product.findUnique({ where: { id: product.id } });
            expect(updated?.categoryId).toBeNull();

            await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
            await prisma.product.delete({ where: { id: product.id } });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .delete(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(404);
        });

        it("403: USER no puede eliminar", async () => {
            const category = await prisma.category.create({ data: { name: "No eliminar" } });

            const res = await request(app)
                .delete(`${BASE}/${category.id}`)
                .set("Cookie", userCookie);

            expect(res.status).toBe(403);
        });
    });
});
