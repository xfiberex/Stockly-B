import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { CONTADOR_DE_COMPRAS, siguienteNumeroDeCompra } from "@/shared/lib/numeroDeCompra";
import { CONTADOR_DE_VENTAS } from "@/shared/lib/numeroDeVenta";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";
import { escribirNumeroDeCompra } from "@/contratos/api";
import { notificationsService } from "@/modules/notifications/notifications.service";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/purchase-orders";

/**
 * AUD-019 — el número correlativo de compra. Antes una compra se nombraba con el principio de su
 * UUID («Compra #3F9A1C0B»), que no se puede dictar por teléfono a un proveedor. Es el gemelo de
 * `numero-de-venta.test.ts` (T6-04): lo que se vigila es lo mismo —sin números repetidos a la vez
 * y sin gastar el de una compra que no llega a existir— y además que las dos series no se mezclan.
 */
describe("Número correlativo de compra (AUD-019)", () => {
    let cookie: string;

    beforeEach(async () => {
        await cleanDb();
        const admin = await createUser({ email: "compras@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await esperarAlertasEnVuelo();
        await cleanDb();
    });

    const comprar = (extra: Record<string, unknown> = {}, items: Array<Record<string, unknown>> = [{ productName: "Cajas", quantity: 1, unitPrice: 10 }]) =>
        request(app).post(BASE).set("Cookie", cookie).send({ items, ...extra });

    const contador = async (key = CONTADOR_DE_COMPRAS) => (await prisma.counter.findUnique({ where: { key } }))?.value;

    it("se escribe con seis cifras, como el de una venta", () => {
        expect(escribirNumeroDeCompra(42)).toBe("000042");
        expect(escribirNumeroDeCompra(1234567)).toBe("1234567");
    });

    it("la primera compra es la 1 y cada una recibe el número siguiente, también al leerla", async () => {
        const primera = await comprar();
        const segunda = await comprar();

        expect(primera.status).toBe(201);
        expect(primera.body.data.number).toBe(1);
        expect(segunda.body.data.number).toBe(2);
        const leida = await request(app).get(`${BASE}/${segunda.body.data.id}`).set("Cookie", cookie);
        expect(leida.body.data.number).toBe(2);
        const lista = await request(app).get(BASE).set("Cookie", cookie);
        expect(lista.body.data.data.map((o: { number: number }) => o.number)).toEqual([2, 1]);
    });

    it("quien llama no elige el número: uno enviado en el cuerpo no se guarda", async () => {
        const res = await comprar({ number: 500 });

        expect(res.status).toBe(201);
        expect(res.body.data.number).toBe(1);
    });

    it("la serie de compras es aparte de la de ventas: ninguna mueve el contador de la otra", async () => {
        await request(app).post("/api/v1/sale-orders").set("Cookie", cookie).send({ items: [{ productName: "Servicio", quantity: 1, unitPrice: 10 }] }).expect(201);

        expect((await comprar()).body.data.number).toBe(1);
        expect(await contador()).toBe(1);
        expect(await contador(CONTADOR_DE_VENTAS)).toBe(1);
    });

    it("veinte compras creadas a la vez reciben veinte números consecutivos y distintos", async () => {
        const respuestas = await Promise.all(Array.from({ length: 20 }, () => comprar()));

        expect(respuestas.map((r) => r.status)).toEqual(Array(20).fill(201));
        const numeros = respuestas.map((r) => r.body.data.number as number).sort((a, b) => a - b);
        expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
        expect(await contador()).toBe(20);
    });

    it("el número tomado en una transacción que se deshace vuelve al contador", async () => {
        await comprar();

        const fallida = prisma.$transaction(async (tx) => {
            expect(await siguienteNumeroDeCompra(tx)).toBe(2);
            throw new Error("la compra no llega a crearse");
        });
        await expect(fallida).rejects.toThrow("la compra no llega a crearse");

        expect(await contador()).toBe(1);
        expect((await comprar()).body.data.number).toBe(2);
    });

    it("si falta la fila del contador, la serie sigue desde la última orden y no repite número", async () => {
        await comprar();
        await comprar();
        await prisma.counter.deleteMany();

        expect((await comprar()).body.data.number).toBe(3);
    });

    it("generar desde sugerencias da un número a cada orden, por orden de proveedor", async () => {
        const norte = await prisma.supplier.create({ data: { name: "Norte" } });
        const sur = await prisma.supplier.create({ data: { name: "Sur" } });
        const tornillo = await crearProducto({ data: { name: "Tornillo", price: 5, stock: 0, supplierId: sur.id } });
        const tuerca = await crearProducto({ data: { name: "Tuerca", price: 5, stock: 0, supplierId: norte.id } });
        await comprar();

        const res = await request(app)
            .post(`${BASE}/suggestions`)
            .set("Cookie", cookie)
            .send({ items: [{ productId: tornillo.id, quantity: 3, unitPrice: 2 }, { productId: tuerca.id, quantity: 4, unitPrice: 1 }] });

        expect(res.status).toBe(201);
        expect(res.body.data.map((o: { number: number; supplier: { name: string } }) => [o.supplier.name, o.number])).toEqual([
            ["Norte", 2],
            ["Sur", 3],
        ]);
        expect(await contador()).toBe(3);
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("dónde se lee", () => {
        it("las notas de recibir y de cancelar, y el historial de costes, nombran la compra por su número", async () => {
            const producto = await crearProducto({ data: { name: "Lámpara", price: 50, stock: 0 } });
            await comprar();
            const { body } = await comprar({}, [{ productId: producto.id, productName: "Lámpara", quantity: 2, unitPrice: 20 }]);
            const orden = body.data as { id: string; items: Array<{ id: string }> };

            await request(app).post(`${BASE}/${orden.id}/receipts`).set("Cookie", cookie).send({ items: [{ itemId: orden.items[0]!.id, quantity: 2 }] }).expect(201);
            await request(app).patch(`${BASE}/${orden.id}`).set("Cookie", cookie).send({ status: "CANCELLED" }).expect(200);

            const notas = (await prisma.stockMovement.findMany({ where: { productId: producto.id } })).map((m) => m.note).sort();
            expect(notas).toEqual(["Cancelación de orden de compra #000002", "Orden de compra #000002"]);

            const historial = await request(app).get(`/api/v1/products/${producto.id}/cost-history`).set("Cookie", cookie);
            expect(historial.body.data.history[0]).toMatchObject({ purchaseOrderId: orden.id, purchaseOrderNumber: 2 });
        });

        it("el aviso de compra atrasada trae el número", async () => {
            const orden = await comprar();
            await prisma.purchaseOrder.update({ where: { id: orden.body.data.id }, data: { createdAt: new Date("2026-01-01T12:00:00Z") } });

            await notificationsService.mantener(new Date("2026-03-01T12:00:00Z"));

            const aviso = await prisma.notification.findFirst({ where: { type: "PURCHASE_OVERDUE", entityId: orden.body.data.id } });
            expect(aviso?.data).toMatchObject({ orderNumber: 1 });
        });

        it("la exportación trae el número con sus ceros, al final para no mover las columnas", async () => {
            await comprar();

            const csv = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie).expect(200);

            const [cabecera, fila] = csv.text.replace(/^﻿/, "").trim().split("\n");
            expect(cabecera!.split(",").at(-1)).toBe("orderNumber");
            expect(fila!.split(",").at(-1)).toBe("000001");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    /** Se ejecuta **el SQL del propio archivo de migración**, como en `numero-de-venta.test.ts`. */
    describe("la migración de las órdenes que ya existían", () => {
        const MIGRACION = path.join(process.cwd(), "prisma", "migrations", "20261114120000_aud_019_numero_de_compra", "migration.sql");
        const DESDE = "-- ── Datos: las órdenes que ya existen";
        const HASTA = "-- ── Restricciones";

        function sentenciasDeDatos(): string[] {
            const sql = readFileSync(MIGRACION, "utf8").replace(/\r\n/g, "\n");
            const inicio = sql.indexOf(DESDE);
            const fin = sql.indexOf(HASTA);
            if (inicio === -1 || fin === -1) throw new Error("Faltan los marcadores de datos en la migración");

            return sql
                .slice(inicio, fin)
                .split(/;\n\n/)
                .filter((trozo) => trozo.split("\n").some((linea) => linea.trim() !== "" && !linea.trim().startsWith("--")));
        }

        /** «Sin numerar» se imita con números altos y desordenados respecto a la fecha. */
        const antigua = (id: string, createdAt: string, provisional: number) =>
            prisma.purchaseOrder.create({ data: { warehouseId: ALMACEN, id, number: provisional, createdAt: new Date(createdAt) } });

        const migrar = async () => {
            await prisma.counter.deleteMany();
            for (const sentencia of sentenciasDeDatos()) await prisma.$executeRawUnsafe(sentencia);
        };

        it("la parte de datos son dos sentencias: numerar las órdenes y dejar el contador", () => {
            const sentencias = sentenciasDeDatos();
            expect(sentencias).toHaveLength(2);
            expect(sentencias[0]).toMatch(/UPDATE "purchase_orders"/);
            expect(sentencias[1]).toMatch(/INSERT INTO "counters"/);
        });

        it("numera por fecha de creación y, a igualdad, por id; el contador arranca en la última", async () => {
            await antigua("c-marzo", "2026-03-01T10:00:00Z", 9001);
            await antigua("a-enero", "2026-01-01T10:00:00Z", 9003);
            await antigua("z-febrero", "2026-02-01T10:00:00Z", 9002);
            await antigua("b-febrero", "2026-02-01T10:00:00Z", 9004);

            await migrar();

            const ordenes = await prisma.purchaseOrder.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true } });
            expect(ordenes).toEqual([
                { id: "a-enero", number: 1 },
                { id: "b-febrero", number: 2 },
                { id: "z-febrero", number: 3 },
                { id: "c-marzo", number: 4 },
            ]);
            expect(await contador()).toBe(4);
            expect((await comprar()).body.data.number).toBe(5);
        });

        it("sobre una base sin órdenes, el contador queda en 0 y la primera compra es la 1", async () => {
            await migrar();

            expect(await contador()).toBe(0);
            expect((await comprar()).body.data.number).toBe(1);
        });
    });
});
