import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { productService } from "@/modules/products/product.service";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/sale-orders";

async function createProduct(name: string, stock: number, minStock = 0) {
    return prisma.product.create({ data: { name, price: 10, stock, minStock } });
}

describe("Sale Orders API", () => {
    let adminCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "sales_admin@example.com", role: "ADMIN" });
        adminCookie = getAuthCookie(admin.id);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    // -----------------------------------------------------------------------
    describe("Guardia de autenticación", () => {
        it("401: GET /sale-orders sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("401: POST /sale-orders sin cookie", async () => {
            const res = await request(app).post(BASE).send({ items: [] });
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("Cancelación de una orden ya enviada (reposición de stock)", () => {
        it("repone el stock y registra un movimiento IN compensatorio", async () => {
            const product = await createProduct("Monitor", 100);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Monitor", quantity: 30, unitPrice: 10 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "SHIPPED" });
            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(70);

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
            expect(movements[1]!.type).toBe("IN");
            expect(movements[1]!.delta).toBe(30);
            expect(movements[1]!.stockAfter).toBe(100);
        });

        it("cancelar una orden PENDING no toca el stock", async () => {
            const product = await createProduct("Webcam", 12);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Webcam", quantity: 4, unitPrice: 10 }] });

            const res = await request(app)
                .patch(`${BASE}/${created.body.data.id}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });
            expect(res.status).toBe(200);

            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(12);
            expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(0);
        });

        it("no repone dos veces si ya estaba cancelada", async () => {
            const product = await createProduct("Auriculares", 20);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Auriculares", quantity: 5, unitPrice: 10 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "SHIPPED" });
            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "CANCELLED" });

            // Una orden cancelada ya no admite modificaciones
            const again = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "CANCELLED" });
            expect(again.status).toBe(400);

            expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(20);
        });
    });

    // -----------------------------------------------------------------------
    describe("Envío de orden (descuento de stock)", () => {
        it("descuenta stock y registra un movimiento OUT al marcar SHIPPED", async () => {
            const product = await createProduct("Teclado", 10);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Teclado", quantity: 3, unitPrice: 10 }] });
            expect(created.status).toBe(201);
            const orderId = created.body.data.id;

            const shipped = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "SHIPPED" });
            expect(shipped.status).toBe(200);

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(7);

            const movements = await prisma.stockMovement.findMany({ where: { productId: product.id } });
            expect(movements).toHaveLength(1);
            expect(movements[0]!.type).toBe("OUT");
            expect(movements[0]!.delta).toBe(-3);
            expect(movements[0]!.stockAfter).toBe(7);
        });

        it("400 si el stock es insuficiente y no altera el stock", async () => {
            const product = await createProduct("Mouse", 2);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Mouse", quantity: 5, unitPrice: 10 }] });
            const orderId = created.body.data.id;

            const shipped = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "SHIPPED" });
            expect(shipped.status).toBe(400);
            expect(shipped.body.message).toMatch(/Stock insuficiente/i);

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(2); // intacto
            const order = await prisma.saleOrder.findUniqueOrThrow({ where: { id: orderId } });
            expect(order.status).toBe("PENDING"); // no se marcó como enviada
        });

        it("ATOMICIDAD: si un ítem falla, ningún otro ítem se descuenta y la orden sigue PENDING", async () => {
            const ok = await createProduct("Suficiente", 100);
            const short = await createProduct("Escaso", 1);

            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({
                    items: [
                        { productId: ok.id, productName: "Suficiente", quantity: 10, unitPrice: 10 },
                        { productId: short.id, productName: "Escaso", quantity: 5, unitPrice: 10 },
                    ],
                });
            const orderId = created.body.data.id;

            const shipped = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "SHIPPED" });
            expect(shipped.status).toBe(400);

            // El producto con stock suficiente NO debe haberse descontado (rollback completo)
            const okAfter = await prisma.product.findUniqueOrThrow({ where: { id: ok.id } });
            expect(okAfter.stock).toBe(100);
            const shortAfter = await prisma.product.findUniqueOrThrow({ where: { id: short.id } });
            expect(shortAfter.stock).toBe(1);

            const movements = await prisma.stockMovement.findMany();
            expect(movements).toHaveLength(0);

            const order = await prisma.saleOrder.findUniqueOrThrow({ where: { id: orderId } });
            expect(order.status).toBe("PENDING");
        });

        it("400 al intentar enviar una orden ya enviada", async () => {
            const product = await createProduct("Monitor", 10);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Monitor", quantity: 1, unitPrice: 10 }] });
            const orderId = created.body.data.id;

            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "SHIPPED" });
            const second = await request(app)
                .patch(`${BASE}/${orderId}`)
                .set("Cookie", adminCookie)
                .send({ status: "SHIPPED" });
            expect(second.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe("Eliminación", () => {
        it("no permite eliminar una orden ya enviada", async () => {
            const product = await createProduct("Webcam", 5);
            const created = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ items: [{ productId: product.id, productName: "Webcam", quantity: 1, unitPrice: 10 }] });
            const orderId = created.body.data.id;
            await request(app).patch(`${BASE}/${orderId}`).set("Cookie", adminCookie).send({ status: "SHIPPED" });

            const res = await request(app).delete(`${BASE}/${orderId}`).set("Cookie", adminCookie);
            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe("Concurrencia de stock (movimientos manuales)", () => {
        it("dos salidas concurrentes sobre stock=1 no provocan stock negativo", async () => {
            const product = await createProduct("Unidad única", 1);

            const results = await Promise.allSettled([
                productService.createManualMovement(product.id, { type: "OUT", quantity: 1, reason: "venta A" }),
                productService.createManualMovement(product.id, { type: "OUT", quantity: 1, reason: "venta B" }),
            ]);

            const fulfilled = results.filter((r) => r.status === "fulfilled");
            const rejected = results.filter((r) => r.status === "rejected");
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);

            const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
            expect(after.stock).toBe(0); // nunca negativo

            const movements = await prisma.stockMovement.findMany({ where: { productId: product.id } });
            expect(movements).toHaveLength(1); // solo el movimiento que tuvo éxito
        });
    });

    // -----------------------------------------------------------------------
    // T2-23: el controlador de órdenes de venta se quedaba en el 69 % porque el listado,
    // la lectura por id y la exportación no tenían ningún test. Son las tres rutas de
    // solo lectura, justo las que nadie mira hasta que dejan de funcionar.
    describe("Listado, lectura y exportación (T2-23)", () => {
        async function ordenDePrueba() {
            const product = await prisma.product.create({
                data: { name: "T223-Teclado", price: 25, stock: 10, minStock: 0 },
            });
            const res = await request(app).post(BASE).set("Cookie", adminCookie).send({
                customerName: "Cliente T223",
                items: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice: 25 }],
            });
            expect(res.status).toBe(201);
            return { product, orderId: res.body.data.id as string };
        }

        it("200: el listado viene paginado, con la lista dentro de data.data", async () => {
            await ordenDePrueba();

            const res = await request(app).get(BASE).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.meta).toMatchObject({ total: 1, page: 1 });
        });

        it("200: el filtro por estado descarta las que no coinciden", async () => {
            await ordenDePrueba();

            const enviadas = await request(app).get(`${BASE}?status=SHIPPED`).set("Cookie", adminCookie);
            const pendientes = await request(app).get(`${BASE}?status=PENDING`).set("Cookie", adminCookie);

            expect(enviadas.body.data.data).toHaveLength(0);
            expect(pendientes.body.data.data).toHaveLength(1);
        });

        it("200 y 404: lectura por id", async () => {
            const { orderId } = await ordenDePrueba();

            const encontrada = await request(app).get(`${BASE}/${orderId}`).set("Cookie", adminCookie);
            expect(encontrada.status).toBe(200);
            expect(encontrada.body.data.items).toHaveLength(1);

            const inexistente = await request(app)
                .get(`${BASE}/aaaaaaaa-1111-2222-3333-444444444444`)
                .set("Cookie", adminCookie);
            expect(inexistente.status).toBe(404);
        });

        it("exporta en CSV una fila por línea de orden, no una por orden", async () => {
            const product = await prisma.product.create({
                data: { name: "T223-Ratón", price: 15, stock: 10, minStock: 0 },
            });
            await request(app).post(BASE).set("Cookie", adminCookie).send({
                customerName: "Cliente dos líneas",
                items: [
                    { productId: product.id, productName: product.name, quantity: 1, unitPrice: 15 },
                    { productName: "Servicio de instalación", quantity: 1, unitPrice: 40 },
                ],
            });

            const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toMatch(/text\/csv/);
            // Cabecera + dos líneas: es la diferencia entre contar órdenes y contar filas,
            // que es justo lo que decide si el tope de la exportación se queda corto.
            const lineas = res.text.replace(/^﻿/, "").trim().split("\n");
            expect(lineas).toHaveLength(3);
            expect(lineas[0]).toBe("orderId,status,customerName,customerEmail,createdAt,productName,quantity,unitPrice,totalLine");
            expect(res.text).toContain("Servicio de instalación");
        });

        it("exporta en JSON con el sobre de la API", async () => {
            await ordenDePrueba();

            const res = await request(app).get(`${BASE}/export`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ success: true, message: "Órdenes de venta exportadas" });
            expect(res.body.data[0]).toMatchObject({ productName: "T223-Teclado", quantity: 2, totalLine: 50 });
        });

        it("401: exportar sin cookie", async () => {
            const res = await request(app).get(`${BASE}/export`);
            expect(res.status).toBe(401);
        });
    });

});
