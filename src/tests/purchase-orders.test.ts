import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/purchase-orders";

async function createProduct(name: string, stock: number) {
    return prisma.product.create({ data: { name, price: 10, stock } });
}

describe("Purchase Orders API", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "po_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "po_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.purchaseOrderItem.deleteMany();
        await prisma.purchaseOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /purchase-orders sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede crear órdenes de compra", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", userCookie)
                .send({ items: [{ productName: "X", quantity: 1, unitPrice: 5 }] });
            expect(res.status).toBe(403);
        });
    });

    describe("Recepción (incremento de stock)", () => {
        it("incrementa stock y registra un movimiento IN al marcar RECEIVED", async () => {
            const product = await createProduct("Cargador", 5);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Cargador", quantity: 10, unitPrice: 8 }] });
            expect(created.status).toBe(201);
            const orderId = created.body.data.id;

            const received = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "RECEIVED" });
            expect(received.status).toBe(200);

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(15);

            const movements = await prisma.stockMovement.findMany({ where: { productId: product.id } });
            expect(movements).toHaveLength(1);
            expect(movements[0]!.type).toBe("IN");
            expect(movements[0]!.delta).toBe(10);
            expect(movements[0]!.stockAfter).toBe(15);
        });

        it("no vuelve a incrementar stock si ya estaba RECEIVED", async () => {
            const product = await createProduct("Batería", 0);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Batería", quantity: 4, unitPrice: 8 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "RECEIVED" });
            // Segundo PATCH con notas (sigue RECEIVED): no debe duplicar el stock
            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ notes: "ok" });

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(4);
        });
    });

    describe("Reglas de estado", () => {
        it("400 al modificar una orden cancelada", async () => {
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productName: "Suelto", quantity: 1, unitPrice: 5 }] });
            const orderId = created.body.data.id;
            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "CANCELLED" });

            const res = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ notes: "intento" });
            expect(res.status).toBe(400);
        });

        it("elimina una orden PENDING pero no una RECEIVED", async () => {
            const product = await createProduct("Funda", 2);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Funda", quantity: 1, unitPrice: 5 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "RECEIVED" });
            const blocked = await request(app).delete(`${BASE}/${orderId}`).set("Cookie", adminCookie);
            expect(blocked.status).toBe(400);

            const pending = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productName: "Otra", quantity: 1, unitPrice: 5 }] });
            const ok = await request(app).delete(`${BASE}/${pending.body.data.id}`).set("Cookie", adminCookie);
            expect(ok.status).toBe(200);
        });
    });

    describe("Exportación", () => {
        it("exporta CSV (ADMIN)", async () => {
            await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productName: "Exportable", quantity: 2, unitPrice: 9 }] });

            const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toMatch(/text\/csv/);
            expect(res.text).toMatch(/Exportable/);
        });
    });
});
