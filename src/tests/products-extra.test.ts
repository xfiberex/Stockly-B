import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    // T2-32: el mock debe exportar **todo** lo que las rutas importan de este módulo.
    // Sin esta línea, Express recibe `undefined` como manejador y la suite no arranca.
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn().mockResolvedValue({ url: "https://res.cloudinary.com/x/y.jpg", publicId: "x/y" }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

const BASE = "/api/v1/products";

describe("Products API — endpoints adicionales", () => {
    let adminCookie: string;
    let userCookie: string;
    let productId: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "px_admin@example.com", role: "ADMIN" });
        adminCookie = getAuthCookie(admin.id);
        const user = await createUser({ email: "px_user@example.com", role: "USER" });
        userCookie = getAuthCookie(user.id);

        const product = await prisma.product.create({
            data: { name: "Teclado mecánico", price: 100, stock: 20, minStock: 5 },
        });
        productId = product.id;
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Autorización por rol", () => {
        it("403: un USER no puede crear productos", async () => {
            const res = await request(app).post(BASE).set("Cookie", userCookie).send({ name: "N", price: 1 });
            expect(res.status).toBe(403);
        });

        it("403: un USER no puede actualizar productos", async () => {
            const res = await request(app).put(`${BASE}/${productId}`).set("Cookie", userCookie).send({ name: "N" });
            expect(res.status).toBe(403);
        });

        it("403: un USER no puede eliminar productos", async () => {
            const res = await request(app).delete(`${BASE}/${productId}`).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });

        it("403: un USER no puede hacer ajuste masivo de stock", async () => {
            const res = await request(app)
                .patch(`${BASE}/bulk-stock`)
                .set("Cookie", userCookie)
                .send({ items: [{ productId, stock: 1 }] });
            expect(res.status).toBe(403);
        });

        it("200: un USER sí puede leer el catálogo", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(200);
        });
    });

    describe("POST /:id/movements (movimiento manual)", () => {
        it("201: una entrada IN incrementa el stock", async () => {
            const res = await request(app)
                .post(`${BASE}/${productId}/movements`)
                .set("Cookie", adminCookie)
                .send({ type: "IN", quantity: 10, reason: "Compra" });
            expect(res.status).toBe(201);
            const p = await prisma.product.findUnique({ where: { id: productId } });
            expect(p?.stock).toBe(30);
        });

        it("201: una salida OUT descuenta el stock", async () => {
            const res = await request(app)
                .post(`${BASE}/${productId}/movements`)
                .set("Cookie", adminCookie)
                .send({ type: "OUT", quantity: 5, reason: "Venta" });
            expect(res.status).toBe(201);
            const p = await prisma.product.findUnique({ where: { id: productId } });
            expect(p?.stock).toBe(25);
        });

        it("400: una salida OUT no puede dejar el stock negativo", async () => {
            const res = await request(app)
                .post(`${BASE}/${productId}/movements`)
                .set("Cookie", adminCookie)
                .send({ type: "OUT", quantity: 9999, reason: "Venta" });
            expect(res.status).toBe(400);
        });

        it("201: un ADJUSTMENT fija el stock al valor exacto", async () => {
            const res = await request(app)
                .post(`${BASE}/${productId}/movements`)
                .set("Cookie", adminCookie)
                .send({ type: "ADJUSTMENT", quantity: 42, reason: "Inventario físico" });
            expect(res.status).toBe(201);
            const p = await prisma.product.findUnique({ where: { id: productId } });
            expect(p?.stock).toBe(42);
        });

        it("422: cantidad inválida (0)", async () => {
            const res = await request(app)
                .post(`${BASE}/${productId}/movements`)
                .set("Cookie", adminCookie)
                .send({ type: "IN", quantity: 0, reason: "X" });
            expect(res.status).toBe(422);
        });
    });

    describe("PATCH /bulk-stock", () => {
        it("200: actualiza el stock de los productos indicados", async () => {
            const res = await request(app)
                .patch(`${BASE}/bulk-stock`)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId, stock: 8 }], reason: "Ajuste masivo" });
            expect(res.status).toBe(200);
            const p = await prisma.product.findUnique({ where: { id: productId } });
            expect(p?.stock).toBe(8);
        });
    });

    describe("GET /:id/price-history", () => {
        it("200: registra el cambio de precio en el historial", async () => {
            await request(app).put(`${BASE}/${productId}`).set("Cookie", adminCookie).send({ price: 150 });
            const res = await request(app).get(`${BASE}/${productId}/price-history`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.history)).toBe(true);
            expect(res.body.data.history.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("GET /:id/movements/export", () => {
        it("200: exporta los movimientos como CSV", async () => {
            const res = await request(app)
                .get(`${BASE}/${productId}/movements/export?format=csv`)
                .set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toMatch(/csv/);
        });
    });
});
