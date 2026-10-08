import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { clienteSchema, ordenVentaSchema } from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const VENTAS = "/api/v1/sale-orders";
const CLIENTES = "/api/v1/customers";
const ITEMS = [{ productName: "Servicio", quantity: 1, unitPrice: 10 }];

/**
 * T6-06 — quién registró la venta y el documento del cliente.
 *
 * Los dos son instantáneas: lo que se vigila es que sigan diciendo lo que decían cuando la
 * cuenta o el cliente de los que salieron cambian o desaparecen, y que ninguno de los dos se
 * convierta en algo que no es —el vendedor, en un campo que se edita; el documento, en una
 * clave que agrupa clientes—.
 */
describe("Vendedor y documento del cliente en la venta (T6-06)", () => {
    let cookie: string;
    let vendedora: { id: string; email: string };

    beforeEach(async () => {
        await cleanDb();
        vendedora = await createUser({ email: "vendedora@example.com", role: "ADMIN" });
        cookie = getAuthCookie(vendedora.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    const vender = (extra: Record<string, unknown> = {}, conCookie = cookie) =>
        request(app).post(VENTAS).set("Cookie", conCookie).send({ items: ITEMS, ...extra });
    const leer = async (id: string) => (await request(app).get(`${VENTAS}/${id}`).set("Cookie", cookie)).body.data;
    const crearCliente = (cuerpo: Record<string, unknown>) => request(app).post(CLIENTES).set("Cookie", cookie).send(cuerpo);

    // ─────────────────────────────────────────────────────────────────────────
    describe("quién la registró", () => {
        it("la orden lo dice ella misma, con el correo de la sesión", async () => {
            const res = await vender();

            expect(res.status).toBe(201);
            expect(res.body.data.createdByEmail).toBe("vendedora@example.com");
            expect(ordenVentaSchema.safeParse(res.body.data).success).toBe(true);
            // Y lo lee cualquiera que lea ventas, no solo quien lee la auditoría.
            const lector = await createUser({ email: "lector@example.com", role: "USER" });
            const lista = await request(app).get(VENTAS).set("Cookie", getAuthCookie(lector.id));
            expect(lista.body.data.data[0].createdByEmail).toBe("vendedora@example.com");
        });

        it("lo sigue diciendo aunque después se desactive esa cuenta, o se borre", async () => {
            const otra = await createUser({ email: "otra-admin@example.com", role: "ADMIN" });
            const { body } = await vender();

            await prisma.user.update({ where: { id: vendedora.id }, data: { isActive: false } });
            cookie = getAuthCookie(otra.id);
            expect((await leer(body.data.id)).createdByEmail).toBe("vendedora@example.com");

            await prisma.auditLog.deleteMany();
            await prisma.user.delete({ where: { id: vendedora.id } });
            expect((await leer(body.data.id)).createdByEmail).toBe("vendedora@example.com");
        });

        it("no lo elige quien llama: uno enviado en el cuerpo no se guarda", async () => {
            const res = await vender({ createdByEmail: "jefa@example.com" });

            expect(res.status).toBe(201);
            expect(res.body.data.createdByEmail).toBe("vendedora@example.com");
        });

        it("editar, enviar o cancelar la orden no cambia quién la vendió, lo haga quien lo haga", async () => {
            const otra = await createUser({ email: "otra-admin@example.com", role: "ADMIN" });
            const { body } = await vender();
            const comoOtra = getAuthCookie(otra.id);

            const editada = await request(app).patch(`${VENTAS}/${body.data.id}`).set("Cookie", comoOtra).send({ notes: "x", createdByEmail: "otra-admin@example.com" });
            const enviada = await request(app).post(`${VENTAS}/${body.data.id}/ship`).set("Cookie", comoOtra);
            const cancelada = await request(app).patch(`${VENTAS}/${body.data.id}`).set("Cookie", comoOtra).send({ status: "CANCELLED" });

            expect([editada.status, enviada.status, cancelada.status]).toEqual([200, 200, 200]);
            for (const res of [editada, enviada, cancelada]) expect(res.body.data.createdByEmail).toBe("vendedora@example.com");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el documento del cliente", () => {
        it("un cliente se da de alta con su documento, recortado, y la API lo devuelve", async () => {
            const res = await crearCliente({ name: "Ana Soto", email: "ana@correo.com", document: "  001-1234567-8 " });

            expect(res.status).toBe(201);
            expect(res.body.data.document).toBe("001-1234567-8");
            expect(clienteSchema.safeParse(res.body.data).success).toBe(true);
        });

        it("sin documento, el cliente lo tiene a null", async () => {
            expect((await crearCliente({ name: "Ana Soto" })).body.data.document).toBeNull();
        });

        it("al editar, vacío lo borra y ausente no lo toca", async () => {
            const { body } = await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });
            const editar = (cuerpo: Record<string, unknown>) =>
                request(app).put(`${CLIENTES}/${body.data.id}`).set("Cookie", cookie).send(cuerpo);

            expect((await editar({ name: "Ana S." })).body.data.document).toBe("001-1234567-8");
            expect((await editar({ name: "Ana S.", document: "" })).body.data.document).toBeNull();
        });

        it.each([
            ["de más de 40 caracteres", "x".repeat(41)],
            ["con un salto de línea", "001\n002"],
        ])("422 con un documento %s, en el cliente y en la venta", async (_caso, documento) => {
            expect((await crearCliente({ name: "Ana", document: documento })).status).toBe(422);
            expect((await vender({ customerDocument: documento })).status).toBe(422);
            expect(await prisma.customer.count()).toBe(0);
            expect(await prisma.saleOrder.count()).toBe(0);
        });

        it("el listado de clientes lo encuentra por su documento", async () => {
            await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });
            await crearCliente({ name: "Beto Ruiz", document: "B-98765432" });

            const res = await request(app).get(`${CLIENTES}?search=b-9876`).set("Cookie", cookie);

            expect(res.body.data.data.map((c: { name: string }) => c.name)).toEqual(["Beto Ruiz"]);
        });

        it("elegir un cliente con documento lo copia a la venta", async () => {
            const cliente = await crearCliente({ name: "Ana Soto", email: "ana@correo.com", document: "001-1234567-8" });

            const res = await vender({ customerId: cliente.body.data.id });

            expect(res.body.data).toMatchObject({ customerId: cliente.body.data.id, customerName: "Ana Soto", customerDocument: "001-1234567-8" });
        });

        it("el que diga la venta manda sobre el del cliente, y no lo cambia", async () => {
            const cliente = await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });

            const res = await vender({ customerId: cliente.body.data.id, customerDocument: "RNC 1-31-00000-1" });

            expect(res.body.data.customerDocument).toBe("RNC 1-31-00000-1");
            expect((await prisma.customer.findUniqueOrThrow({ where: { id: cliente.body.data.id } })).document).toBe("001-1234567-8");
        });

        it("editar el cliente después no cambia la orden", async () => {
            const cliente = await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });
            const venta = await vender({ customerId: cliente.body.data.id });

            await request(app).put(`${CLIENTES}/${cliente.body.data.id}`).set("Cookie", cookie).send({ name: "Ana Soto", document: "999-9999999-9" }).expect(200);

            expect((await leer(venta.body.data.id)).customerDocument).toBe("001-1234567-8");
        });

        it("borrar el cliente deja el documento en la instantánea de la orden", async () => {
            const cliente = await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });
            const venta = await vender({ customerId: cliente.body.data.id });

            await request(app).delete(`${CLIENTES}/${cliente.body.data.id}`).set("Cookie", cookie).expect(200);

            expect(await leer(venta.body.data.id)).toMatchObject({ customerId: null, customerName: "Ana Soto", customerDocument: "001-1234567-8" });
        });

        it("el PATCH de la orden corrige el documento de la instantánea, como el nombre", async () => {
            const venta = await vender({ customerDocument: "001" });

            const res = await request(app).patch(`${VENTAS}/${venta.body.data.id}`).set("Cookie", cookie).send({ customerDocument: "001-1234567-8" });

            expect(res.body.data.customerDocument).toBe("001-1234567-8");
        });

        it("una venta con correo nuevo crea el cliente con el documento de la venta", async () => {
            const res = await vender({ customerName: "Carla", customerEmail: "carla@correo.com", customerDocument: "402-0000000-1" });

            const cliente = await prisma.customer.findUniqueOrThrow({ where: { id: res.body.data.customerId } });
            expect(cliente).toMatchObject({ email: "carla@correo.com", document: "402-0000000-1" });
        });

        it("el documento no agrupa: con documento y sin correo, la venta no se vincula a nadie", async () => {
            await crearCliente({ name: "Ana Soto", document: "001-1234567-8" });

            const res = await vender({ customerName: "Ana Soto", customerDocument: "001-1234567-8" });

            expect(res.body.data).toMatchObject({ customerId: null, customerDocument: "001-1234567-8" });
            expect(await prisma.customer.count()).toBe(1);
        });

        it("ni es único: dos clientes pueden tener el mismo, y dos correos siguen siendo dos clientes", async () => {
            const una = await vender({ customerEmail: "ana@correo.com", customerDocument: "001-1234567-8" });
            const otra = await vender({ customerEmail: "ana.trabajo@correo.com", customerDocument: "001-1234567-8" });

            expect(una.body.data.customerId).not.toBe(otra.body.data.customerId);
            expect(await prisma.customer.count({ where: { document: "001-1234567-8" } })).toBe(2);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    it("la exportación trae el documento y quién registró la venta", async () => {
        await vender({ customerName: "Ana Soto", customerDocument: "001-1234567-8" });

        const csv = await request(app).get(`${VENTAS}/export?format=csv`).set("Cookie", cookie);
        const json = await request(app).get(`${VENTAS}/export`).set("Cookie", cookie);

        const cabecera = csv.text.replace(/^﻿/, "").trim().split("\n")[0]!.split(",");
        expect(cabecera).toEqual(expect.arrayContaining(["customerDocument", "createdByEmail"]));
        expect(json.body.data[0]).toMatchObject({ customerDocument: "001-1234567-8", createdByEmail: "vendedora@example.com" });
    });

    // ─────────────────────────────────────────────────────────────────────────
    /** Se ejecuta **el SQL del propio archivo de migración**, como en T5-06 y T6-04. */
    describe("la migración de las órdenes que ya existían", () => {
        const MIGRACION = path.join(process.cwd(), "prisma", "migrations", "20261008120000_t6_06_vendedor_y_documento", "migration.sql");
        const MARCADOR = "-- ── Datos: las órdenes que ya existen";

        function sentenciasDeDatos(): string[] {
            const sql = readFileSync(MIGRACION, "utf8").replace(/\r\n/g, "\n");
            const inicio = sql.indexOf(MARCADOR);
            if (inicio === -1) throw new Error(`No está el marcador «${MARCADOR}» en la migración`);

            return sql
                .slice(inicio)
                .split(/;\n\n/)
                .filter((trozo) => trozo.split("\n").some((linea) => linea.trim() !== "" && !linea.trim().startsWith("--")));
        }

        const migrar = async () => {
            for (const sentencia of sentenciasDeDatos()) await prisma.$executeRawUnsafe(sentencia);
        };

        const antigua = async (id: string) => prisma.saleOrder.create({ data: { id, number: await numeroDeVenta() } });
        const rastro = (entityId: string, userEmail: string | null, createdAt: string, extra: Record<string, unknown> = {}) =>
            prisma.auditLog.create({ data: { action: "CREATE", entity: "SaleOrder", entityId, userEmail, createdAt: new Date(createdAt), ...extra } });

        it("la parte de datos son dos sentencias: recuperar el vendedor y contar las que se quedan sin él", () => {
            const sentencias = sentenciasDeDatos();
            expect(sentencias).toHaveLength(2);
            expect(sentencias[0]).toMatch(/UPDATE "sale_orders"/);
            expect(sentencias[1]).toMatch(/RAISE NOTICE/);
        });

        it("recupera el vendedor de la fila CREATE de la auditoría, y solo de esa", async () => {
            await antigua("con-rastro");
            await antigua("sin-rastro");
            await antigua("dos-rastros");
            await antigua("rastro-sin-correo");
            await antigua("solo-editada");
            await antigua("primero-sin-correo");

            await rastro("con-rastro", "ana@stockly.test", "2026-09-01T10:00:00Z");
            // Si hubiera dos, manda la más antigua: es la de la creación.
            await rastro("dos-rastros", "tardia@stockly.test", "2026-09-03T10:00:00Z");
            await rastro("dos-rastros", "primera@stockly.test", "2026-09-02T10:00:00Z");
            await rastro("rastro-sin-correo", null, "2026-09-01T10:00:00Z");
            // Una fila sin correo no tapa a otra que sí lo dice, aunque sea anterior.
            await rastro("primero-sin-correo", null, "2026-09-01T10:00:00Z");
            await rastro("primero-sin-correo", "luego@stockly.test", "2026-09-02T10:00:00Z");
            // Quien la editó o la envió no es quien la vendió; ni cuenta el rastro de otra entidad.
            await rastro("solo-editada", "editora@stockly.test", "2026-09-01T10:00:00Z", { action: "UPDATE" });
            await rastro("solo-editada", "almacen@stockly.test", "2026-09-01T11:00:00Z", { action: "SALE_SHIP" });
            await rastro("sin-rastro", "compras@stockly.test", "2026-09-01T10:00:00Z", { entity: "PurchaseOrder" });

            await migrar();

            const ordenes = await prisma.saleOrder.findMany({ select: { id: true, createdByEmail: true }, orderBy: { id: "asc" } });
            expect(ordenes).toEqual([
                { id: "con-rastro", createdByEmail: "ana@stockly.test" },
                { id: "dos-rastros", createdByEmail: "primera@stockly.test" },
                { id: "primero-sin-correo", createdByEmail: "luego@stockly.test" },
                { id: "rastro-sin-correo", createdByEmail: null },
                { id: "sin-rastro", createdByEmail: null },
                { id: "solo-editada", createdByEmail: null },
            ]);
        });

        it("sobre una base sin órdenes no falla", async () => {
            await expect(migrar()).resolves.toBeUndefined();
        });
    });
});
