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

    describe("Cancelación de una orden ya recibida (reversión de stock)", () => {
        it("descuenta el stock y registra un movimiento OUT compensatorio", async () => {
            const product = await createProduct("Teclado", 100);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Teclado", quantity: 40, unitPrice: 8 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "RECEIVED" });
            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(140);

            const cancelled = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });
            expect(cancelled.status).toBe(200);
            expect(cancelled.body.data.status).toBe("CANCELLED");

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(100);

            const movements = await prisma.stockMovement.findMany({
                where: { productId: product.id },
                orderBy: { createdAt: "asc" },
            });
            expect(movements).toHaveLength(2);
            expect(movements[1]!.type).toBe("OUT");
            expect(movements[1]!.delta).toBe(-40);
            expect(movements[1]!.stockAfter).toBe(100);
        });

        it("400 y sin cambios si las unidades recibidas ya se consumieron", async () => {
            const product = await createProduct("Ratón", 0);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Ratón", quantity: 10, unitPrice: 8 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "RECEIVED" });
            // Se vende todo lo recibido antes de intentar cancelar la compra
            await prisma.product.update({ where: { id: product.id }, data: { stock: 3 } });

            const res = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/ya se consumieron/i);

            // La transacción se revierte entera: ni el stock ni el estado cambian
            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(3);
            const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
            expect(order.status).toBe("RECEIVED");
        });

        it("cancelar una orden PENDING no toca el stock", async () => {
            const product = await createProduct("Alfombrilla", 7);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Alfombrilla", quantity: 5, unitPrice: 3 }] });

            const res = await request(app)
                .patch(`${BASE}/${created.body.data.id}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });
            expect(res.status).toBe(200);

            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(7);
            expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(0);
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

    // T2-03: era la única lista de la API sin techo — devolvía todas las órdenes con
    // el detalle completo de cada ítem.
    describe("Paginación", () => {
        async function crearOrdenes(cuantas: number) {
            for (let i = 0; i < cuantas; i++) {
                await request(app)
                    .post(BASE)
                    .set("Cookie", adminCookie)
                    .send({ items: [{ productName: `Ítem ${i}`, quantity: 1, unitPrice: 5 }] });
            }
        }

        it("devuelve `data` y `meta` con el total, la página, el límite y las páginas", async () => {
            await crearOrdenes(3);

            const res = await request(app).get(BASE).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(3);
            expect(res.body.data.meta).toEqual({ total: 3, page: 1, limit: 10, totalPages: 1 });
        });

        it("respeta `page` y `limit`", async () => {
            await crearOrdenes(12);

            const res = await request(app).get(`${BASE}?page=2&limit=5`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(5);
            expect(res.body.data.meta).toMatchObject({ total: 12, page: 2, limit: 5, totalPages: 3 });
        });

        it("no repite órdenes entre páginas", async () => {
            await crearOrdenes(6);

            const p1 = await request(app).get(`${BASE}?page=1&limit=3`).set("Cookie", adminCookie);
            const p2 = await request(app).get(`${BASE}?page=2&limit=3`).set("Cookie", adminCookie);

            const ids1 = p1.body.data.data.map((o: { id: string }) => o.id);
            const ids2 = p2.body.data.data.map((o: { id: string }) => o.id);
            expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
        });

        it("filtra por estado", async () => {
            await crearOrdenes(2);
            const listado = await request(app).get(BASE).set("Cookie", adminCookie);
            await request(app)
                .patch(`${BASE}/${listado.body.data.data[0].id}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });

            const res = await request(app).get(`${BASE}?status=CANCELLED`).set("Cookie", adminCookie);

            expect(res.body.data.meta.total).toBe(1);
            expect(res.body.data.data[0].status).toBe("CANCELLED");
        });

        it("ignora un estado que no existe en lugar de fallar", async () => {
            await crearOrdenes(2);

            const res = await request(app).get(`${BASE}?status=INVENTADO`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(2);
        });

        it("cae a la paginación por defecto con parámetros no numéricos (T1-16)", async () => {
            await crearOrdenes(1);

            const res = await request(app).get(`${BASE}?page=abc&limit=xyz`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.meta).toMatchObject({ page: 1, limit: 10 });
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
