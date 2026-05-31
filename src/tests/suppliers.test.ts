import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/suppliers";

describe("Suppliers API", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "sup_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "sup_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    afterEach(async () => {
        await prisma.supplier.deleteMany();
    });

    // -----------------------------------------------------------------------
    describe("GET /suppliers", () => {
        it("200: devuelve lista de proveedores", async () => {
            await prisma.supplier.createMany({
                data: [{ name: "Proveedor B" }, { name: "Proveedor A" }],
            });

            const res = await request(app).get(BASE).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data[0].name).toBe("Proveedor A"); // ordenado alfabéticamente
        });

        it("401: sin autenticación", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /suppliers", () => {
        it("201: ADMIN crea proveedor completo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "TechDist S.A.", email: "ventas@techdist.com", phone: "+1-555-0100", notes: "Proveedor preferido" });

            expect(res.status).toBe(201);
            expect(res.body.data.name).toBe("TechDist S.A.");
            expect(res.body.data.email).toBe("ventas@techdist.com");
        });

        it("201: crea proveedor sin email ni teléfono", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Proveedor Mínimo" });

            expect(res.status).toBe(201);
            expect(res.body.data.email).toBeNull();
        });

        it("409: email duplicado", async () => {
            await prisma.supplier.create({ data: { name: "Sup A", email: "dup@test.com" } });

            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Sup B", email: "dup@test.com" });

            expect(res.status).toBe(409);
        });

        it("403: USER no puede crear proveedores", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", userCookie)
                .send({ name: "Intento" });

            expect(res.status).toBe(403);
        });

        it("422: nombre vacío", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "" });

            expect(res.status).toBe(422);
        });

        it("422: email inválido", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Sup", email: "no-es-email" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /suppliers/:id", () => {
        let supplierId: string;

        beforeEach(async () => {
            const s = await prisma.supplier.create({ data: { name: "Original Sup" } });
            supplierId = s.id;
        });

        it("200: actualiza proveedor", async () => {
            const res = await request(app)
                .put(`${BASE}/${supplierId}`)
                .set("Cookie", adminCookie)
                .send({ name: "Actualizado", phone: "555-9999" });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Actualizado");
            expect(res.body.data.phone).toBe("555-9999");
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .put(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", adminCookie)
                .send({ name: "Test" });

            expect(res.status).toBe(404);
        });

        it("409: email ya en uso por otro proveedor", async () => {
            await prisma.supplier.create({ data: { name: "Otro Sup", email: "taken@test.com" } });

            const res = await request(app)
                .put(`${BASE}/${supplierId}`)
                .set("Cookie", adminCookie)
                .send({ name: "Original Sup", email: "taken@test.com" });

            expect(res.status).toBe(409);
        });
    });

    // -----------------------------------------------------------------------
    describe("DELETE /suppliers/:id", () => {
        it("200: elimina proveedor y pone supplierId=null en productos", async () => {
            const supplier = await prisma.supplier.create({ data: { name: "A eliminar" } });
            const product = await prisma.product.create({
                data: { name: "Prod con proveedor", price: 10, stock: 1, supplierId: supplier.id },
            });

            const res = await request(app)
                .delete(`${BASE}/${supplier.id}`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(200);

            const updated = await prisma.product.findUnique({ where: { id: product.id } });
            expect(updated?.supplierId).toBeNull();

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
