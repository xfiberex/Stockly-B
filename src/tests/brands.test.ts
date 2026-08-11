import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/brands";

describe("Brands API", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "brand_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "brand_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    afterEach(async () => {
        await prisma.brand.deleteMany();
    });

    // -----------------------------------------------------------------------
    describe("GET /brands", () => {
        it("200: devuelve lista de marcas", async () => {
            await prisma.brand.createMany({ data: [{ name: "Sony" }, { name: "Apple" }] });

            const res = await request(app).get(BASE).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data[0].name).toBe("Apple"); // ordenado alfabéticamente
        });

        it("401: sin autenticación", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /brands", () => {
        it("201: ADMIN crea marca", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Samsung", description: "Electrónica coreana" });

            expect(res.status).toBe(201);
            expect(res.body.data.name).toBe("Samsung");
        });

        it("409: nombre duplicado", async () => {
            await prisma.brand.create({ data: { name: "LG" } });

            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "LG" });

            expect(res.status).toBe(409);
        });

        it("403: USER no puede crear marcas", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", userCookie)
                .send({ name: "NuevaMarca" });

            expect(res.status).toBe(403);
        });

        it("422: nombre vacío", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "" });

            expect(res.status).toBe(422);
            // T4-04: el sobre de un fallo de validación también lleva código, que es lo
            // que el cliente puede enseñar traducido. Los mensajes por campo siguen
            // siendo los del validador, en español, y eso está razonado en el contrato.
            expect(res.body.code).toBe("VALIDATION_ERROR");
            expect(res.body.errors[0]).toMatchObject({ field: "name" });
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /brands/:id", () => {
        let brandId: string;

        beforeEach(async () => {
            const b = await prisma.brand.create({ data: { name: "Original" } });
            brandId = b.id;
        });

        it("200: actualiza nombre", async () => {
            const res = await request(app)
                .put(`${BASE}/${brandId}`)
                .set("Cookie", adminCookie)
                .send({ name: "Actualizada" });

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
    });

    // -----------------------------------------------------------------------
    describe("DELETE /brands/:id", () => {
        it("200: elimina marca y pone brandId=null en productos", async () => {
            const brand = await prisma.brand.create({ data: { name: "A eliminar" } });
            const product = await prisma.product.create({
                data: { name: "Prod con marca", price: 10, stock: 1, brandId: brand.id },
            });

            const res = await request(app)
                .delete(`${BASE}/${brand.id}`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(200);

            const updated = await prisma.product.findUnique({ where: { id: product.id } });
            expect(updated?.brandId).toBeNull();

            await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
            await prisma.product.delete({ where: { id: product.id } });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .delete(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(404);
        });
    });
});
