import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import { clienteEnListadoSchema, fichaClienteSchema, ordenVentaSchema } from "@/contratos/api";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

// T5-06 — clientes como entidad, y la venta que se vincula a ellos.

const BASE = "/api/v1/customers";
const VENTAS = "/api/v1/sale-orders";

/** Un ítem escrito a mano: no toca stock, así que la venta no necesita productos. */
const ITEM = { productName: "Servicio de instalación", quantity: 2, unitPrice: 10 };

async function ordenDe(customerId: string | null, status: "PENDING" | "SHIPPED" | "CANCELLED", importe: number, dias = 0) {
    return prisma.saleOrder.create({
        data: {
            customerId,
            status,
            customerName: "Instantánea",
            createdAt: new Date(Date.now() - dias * 86_400_000),
            items: { create: [{ productName: "Algo", quantity: 1, unitPrice: importe }] },
        },
    });
}

describe("Clientes (T5-06)", () => {
    let admin: string;
    let usuario: string;
    let almacen: string;

    beforeAll(async () => {
        await cleanDb();
        admin = getAuthCookie((await createUser({ email: "cli_admin@example.com", role: "ADMIN" })).id);
        usuario = getAuthCookie((await createUser({ email: "cli_user@example.com", role: "USER" })).id);
        almacen = getAuthCookie((await createUser({ email: "cli_almacen@example.com", role: "WAREHOUSE" })).id);
    });

    afterEach(async () => {
        await prisma.saleOrder.deleteMany();
        await prisma.customer.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /customers", () => {
        it("pagina por nombre y cuenta las órdenes de cada cliente, en cualquier estado", async () => {
            const vega = await prisma.customer.create({ data: { name: "Vega" } });
            await prisma.customer.create({ data: { name: "Alba" } });
            await ordenDe(vega.id, "SHIPPED", 10);
            await ordenDe(vega.id, "CANCELLED", 10);

            const res = await request(app).get(`${BASE}?limit=1`).set("Cookie", usuario);

            expect(res.status).toBe(200);
            expect(res.body.data.meta).toEqual({ total: 2, page: 1, limit: 1, totalPages: 2 });
            expect(res.body.data.data.map((c: { name: string }) => c.name)).toEqual(["Alba"]);

            const segunda = await request(app).get(`${BASE}?page=2&limit=1`).set("Cookie", usuario);
            expect(clienteEnListadoSchema.parse(segunda.body.data.data[0])).toMatchObject({ name: "Vega", ordersCount: 2 });
        });

        it.each([
            ["el nombre, sin distinguir mayúsculas", "nómada"],
            ["el correo, aunque se escriba en mayúsculas", "HOLA@ESTUDIO"],
            ["el teléfono", "4821"],
        ])("busca por %s", async (_caso, busqueda) => {
            await prisma.customer.create({ data: { name: "Estudio Nómada", email: "hola@estudio.com", phone: "+52 55 4821 9930" } });
            await prisma.customer.create({ data: { name: "Otro", email: "otro@correo.com", phone: "111" } });

            const res = await request(app).get(BASE).query({ search: busqueda }).set("Cookie", usuario);

            expect(res.body.data.data.map((c: { name: string }) => c.name)).toEqual(["Estudio Nómada"]);
        });

        it("un `search` repetido se ignora en vez de romper", async () => {
            await prisma.customer.create({ data: { name: "Alba" } });

            const res = await request(app).get(`${BASE}?search=a&search=b`).set("Cookie", usuario);

            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(1);
        });

        it("401 sin sesión", async () => {
            expect((await request(app).get(BASE)).status).toBe(401);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("POST /customers", () => {
        it("guarda el correo normalizado y deja el alta en la auditoría, sin copiar datos personales", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", admin)
                .send({ name: "Ana Soto", email: "  Ana.Soto@Correo.COM ", phone: "", notes: "Paga a 30 días" });

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ name: "Ana Soto", email: "ana.soto@correo.com", phone: null, notes: "Paga a 30 días" });

            const registro = await prisma.auditLog.findFirst({ where: { entity: "Customer", entityId: res.body.data.id } });
            expect(registro).toMatchObject({ action: "CREATE", details: null });
        });

        it("409 si el correo ya es de otro cliente, aunque cambien las mayúsculas", async () => {
            await prisma.customer.create({ data: { name: "Ana", email: "ana@correo.com" } });

            const res = await request(app).post(BASE).set("Cookie", admin).send({ name: "Otra Ana", email: "ANA@correo.com" });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("CUSTOMER_EMAIL_EXISTS");
        });

        it("dos clientes sin correo no chocan", async () => {
            expect((await request(app).post(BASE).set("Cookie", admin).send({ name: "Juan Pérez" })).status).toBe(201);
            expect((await request(app).post(BASE).set("Cookie", admin).send({ name: "Juan Pérez", email: "" })).status).toBe(201);
        });

        it("422 con un correo que no lo es", async () => {
            const res = await request(app).post(BASE).set("Cookie", admin).send({ name: "X", email: "no-es-correo" });
            expect(res.status).toBe(422);
        });

        it.each([["USER", () => usuario], ["WAREHOUSE", () => almacen]])("403 para %s", async (_rol, cookie) => {
            const res = await request(app).post(BASE).set("Cookie", cookie()).send({ name: "X" });
            expect(res.status).toBe(403);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("PUT /customers/:id", () => {
        it("vacío borra el campo y ausente no lo toca", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana", phone: "555", notes: "Nota" } });

            const res = await request(app).put(`${BASE}/${cliente.id}`).set("Cookie", admin).send({ name: "Ana María", phone: "" });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ name: "Ana María", phone: null, notes: "Nota" });
        });

        it("editar el cliente no reescribe sus órdenes pasadas (criterio de T5-06)", async () => {
            const alta = await request(app).post(BASE).set("Cookie", admin).send({ name: "Ana", email: "ana@correo.com", phone: "555" });
            const venta = await request(app).post(VENTAS).set("Cookie", admin).send({ customerId: alta.body.data.id, items: [ITEM] });

            await request(app)
                .put(`${BASE}/${alta.body.data.id}`)
                .set("Cookie", admin)
                .send({ name: "Ana Nueva", email: "nueva@correo.com", phone: "999" });

            const orden = await prisma.saleOrder.findUniqueOrThrow({ where: { id: venta.body.data.id } });
            expect(orden).toMatchObject({
                customerId: alta.body.data.id,
                customerName: "Ana",
                customerEmail: "ana@correo.com",
                customerPhone: "555",
            });
        });

        it("409 si el correo nuevo ya es de otro", async () => {
            await prisma.customer.create({ data: { name: "Ana", email: "ana@correo.com" } });
            const otro = await prisma.customer.create({ data: { name: "Beto", email: "beto@correo.com" } });

            const res = await request(app).put(`${BASE}/${otro.id}`).set("Cookie", admin).send({ name: "Beto", email: "Ana@Correo.com" });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("CUSTOMER_EMAIL_EXISTS");
        });

        it("404 si no existe", async () => {
            const res = await request(app).put(`${BASE}/00000000-0000-4000-8000-000000000000`).set("Cookie", admin).send({ name: "X" });
            expect(res.status).toBe(404);
            expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("DELETE /customers/:id", () => {
        it("sus órdenes se quedan, sin cliente y con la instantánea", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana" } });
            const orden = await ordenDe(cliente.id, "SHIPPED", 10);

            const res = await request(app).delete(`${BASE}/${cliente.id}`).set("Cookie", admin);

            expect(res.status).toBe(200);
            expect(await prisma.saleOrder.findUniqueOrThrow({ where: { id: orden.id } })).toMatchObject({
                customerId: null,
                customerName: "Instantánea",
            });
            expect(await prisma.auditLog.findFirst({ where: { entity: "Customer", action: "DELETE", entityId: cliente.id } })).not.toBeNull();
        });

        it("404 si no existe", async () => {
            const res = await request(app).delete(`${BASE}/00000000-0000-4000-8000-000000000000`).set("Cookie", admin);
            expect(res.status).toBe(404);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /customers/:id — la ficha", () => {
        it("cuenta sus órdenes por estado y suma solo las enviadas (criterio de T5-06)", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana" } });
            const otro = await prisma.customer.create({ data: { name: "Beto" } });
            await ordenDe(cliente.id, "SHIPPED", 100.5, 10);
            await ordenDe(cliente.id, "SHIPPED", 20.25, 5);
            await ordenDe(cliente.id, "PENDING", 1000, 2);
            const ultima = await ordenDe(cliente.id, "CANCELLED", 5000, 1);
            await ordenDe(otro.id, "SHIPPED", 7777);

            const res = await request(app).get(`${BASE}/${cliente.id}`).set("Cookie", almacen);

            expect(res.status).toBe(200);
            const ficha = fichaClienteSchema.parse(res.body.data);
            expect(ficha.summary).toEqual({
                orders: 4,
                pending: 1,
                shipped: 2,
                cancelled: 1,
                shippedRevenue: 120.75,
                lastOrderAt: ultima.createdAt.toISOString(),
            });
        });

        it("un cliente sin órdenes tiene las cifras a cero y sin última orden", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Nuevo" } });

            const res = await request(app).get(`${BASE}/${cliente.id}`).set("Cookie", usuario);

            expect(res.body.data.summary).toEqual({ orders: 0, pending: 0, shipped: 0, cancelled: 0, shippedRevenue: 0, lastOrderAt: null });
        });

        it("enviar una orden por la API la suma al importe de la ficha", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana" } });
            const venta = await request(app).post(VENTAS).set("Cookie", admin).send({ customerId: cliente.id, items: [ITEM] });
            const antes = await request(app).get(`${BASE}/${cliente.id}`).set("Cookie", admin);

            await request(app).post(`${VENTAS}/${venta.body.data.id}/ship`).set("Cookie", almacen);
            const despues = await request(app).get(`${BASE}/${cliente.id}`).set("Cookie", admin);

            expect(antes.body.data.summary.shippedRevenue).toBe(0);
            expect(despues.body.data.summary.shippedRevenue).toBe(20);
        });

        it("404 si no existe", async () => {
            const res = await request(app).get(`${BASE}/00000000-0000-4000-8000-000000000000`).set("Cookie", admin);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("Ventas y clientes", () => {
        it("con `customerId`, la venta va a ese cliente y copia sus datos si no trae los suyos", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana", email: "ana@correo.com", phone: "555" } });

            const res = await request(app)
                .post(VENTAS)
                .set("Cookie", admin)
                .send({ customerId: cliente.id, customerPhone: "777", items: [ITEM] });

            expect(res.status).toBe(201);
            expect(ordenVentaSchema.parse(res.body.data)).toMatchObject({
                customerId: cliente.id,
                customerName: "Ana",
                customerEmail: "ana@correo.com",
                customerPhone: "777",
            });
        });

        it("404 con un `customerId` que no existe", async () => {
            const res = await request(app)
                .post(VENTAS)
                .set("Cookie", admin)
                .send({ customerId: "00000000-0000-4000-8000-000000000000", items: [ITEM] });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
            expect(await prisma.saleOrder.count()).toBe(0);
        });

        it("sin `customerId`, se vincula por el correo al cliente que ya lo tiene", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana", email: "ana@correo.com" } });

            const res = await request(app)
                .post(VENTAS)
                .set("Cookie", admin)
                .send({ customerName: "Ana S.", customerEmail: "Ana@Correo.com", items: [ITEM] });

            expect(res.body.data).toMatchObject({ customerId: cliente.id, customerName: "Ana S.", customerEmail: "Ana@Correo.com" });
            expect(await prisma.customer.count()).toBe(1);
        });

        it("con un correo nuevo, crea el cliente con el nombre y el teléfono de la venta", async () => {
            const res = await request(app)
                .post(VENTAS)
                .set("Cookie", admin)
                .send({ customerName: "Beto", customerEmail: "Beto@Correo.com", customerPhone: "123", items: [ITEM] });

            const cliente = await prisma.customer.findUniqueOrThrow({ where: { email: "beto@correo.com" } });
            expect(cliente).toMatchObject({ name: "Beto", phone: "123" });
            expect(res.body.data.customerId).toBe(cliente.id);
        });

        it("sin correo no se vincula a nadie, ni aunque el nombre coincida", async () => {
            await prisma.customer.create({ data: { name: "Juan Pérez" } });

            const res = await request(app).post(VENTAS).set("Cookie", admin).send({ customerName: "Juan Pérez", items: [ITEM] });

            expect(res.body.data.customerId).toBeNull();
            expect(await prisma.customer.count()).toBe(1);
        });

        it("`GET /sale-orders?customerId=` trae solo las de ese cliente", async () => {
            const ana = await prisma.customer.create({ data: { name: "Ana" } });
            const beto = await prisma.customer.create({ data: { name: "Beto" } });
            const suya = await ordenDe(ana.id, "PENDING", 10);
            await ordenDe(beto.id, "PENDING", 10);
            await ordenDe(null, "PENDING", 10);

            const res = await request(app).get(VENTAS).query({ customerId: ana.id }).set("Cookie", usuario);

            expect(res.body.data.data.map((o: { id: string }) => o.id)).toEqual([suya.id]);
            expect(res.body.data.meta.total).toBe(1);
        });

        it("`PATCH` con `customerId: null` desvincula la orden sin tocar su instantánea", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana" } });
            const orden = await ordenDe(cliente.id, "PENDING", 10);

            const res = await request(app).patch(`${VENTAS}/${orden.id}`).set("Cookie", admin).send({ customerId: null });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ customerId: null, customerName: "Instantánea" });
        });

        it("`PATCH` a un cliente que no existe da 404 y no cambia nada", async () => {
            const orden = await ordenDe(null, "PENDING", 10);

            const res = await request(app)
                .patch(`${VENTAS}/${orden.id}`)
                .set("Cookie", admin)
                .send({ customerId: "00000000-0000-4000-8000-000000000000" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
        });
    });
});
