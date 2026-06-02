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
});
