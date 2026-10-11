import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { CONTADOR_DE_VENTAS, siguienteNumeroDeVenta } from "@/shared/lib/numeroDeVenta";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";
import { escribirNumeroDeVenta } from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto, ponerStock } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/sale-orders";

/**
 * T6-04 — el número correlativo de venta.
 *
 * Lo que se vigila es lo que una secuencia de PostgreSQL o un «leer el último y sumar uno» no
 * dan: que dos ventas a la vez no compartan número y que una venta que no llega a existir no
 * gaste el suyo.
 */
describe("Número correlativo de venta (T6-04)", () => {
    let cookie: string;
    let adminId: string;

    beforeEach(async () => {
        await cleanDb();
        const admin = await createUser({ email: "numeros@example.com", role: "ADMIN" });
        adminId = admin.id;
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await esperarAlertasEnVuelo();
        await cleanDb();
    });

    const vender = (items: Array<Record<string, unknown>> = [{ productName: "Servicio", quantity: 1, unitPrice: 10 }], extra: Record<string, unknown> = {}) =>
        request(app).post(BASE).set("Cookie", cookie).send({ items, ...extra });

    const contador = async () => (await prisma.counter.findUnique({ where: { key: CONTADOR_DE_VENTAS } }))?.value;

    it("se escribe con seis cifras, y con las que tenga si son más", () => {
        expect(escribirNumeroDeVenta(1)).toBe("000001");
        expect(escribirNumeroDeVenta(123)).toBe("000123");
        expect(escribirNumeroDeVenta(999999)).toBe("999999");
        expect(escribirNumeroDeVenta(1234567)).toBe("1234567");
    });

    it("la primera venta es la 1 y cada una recibe el número siguiente", async () => {
        const primera = await vender();
        const segunda = await vender();

        expect(primera.status).toBe(201);
        expect(primera.body.data.number).toBe(1);
        expect(segunda.body.data.number).toBe(2);
        // También al leerla después, no solo en la respuesta de crearla.
        const leida = await request(app).get(`${BASE}/${segunda.body.data.id}`).set("Cookie", cookie);
        expect(leida.body.data.number).toBe(2);
    });

    it("quien llama no elige el número: uno enviado en el cuerpo no se guarda", async () => {
        const res = await vender(undefined, { number: 500 });

        expect(res.status).toBe(201);
        expect(res.body.data.number).toBe(1);
        expect(await contador()).toBe(1);
    });

    it("veinte ventas creadas a la vez reciben veinte números consecutivos y distintos", async () => {
        await vender();

        const respuestas = await Promise.all(Array.from({ length: 20 }, () => vender()));

        expect(respuestas.map((r) => r.status)).toEqual(Array(20).fill(201));
        const numeros = respuestas.map((r) => r.body.data.number as number).sort((a, b) => a - b);
        expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
        expect(await contador()).toBe(21);
    });

    it("también a la vez cuando el contador todavía no existe", async () => {
        // La base recién creada con `db push` no tiene la fila: las veinte compiten por crearla.
        expect(await contador()).toBeUndefined();

        const respuestas = await Promise.all(Array.from({ length: 20 }, () => vender()));

        const numeros = respuestas.map((r) => r.body.data.number as number).sort((a, b) => a - b);
        expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it("una venta rechazada con 409 no consume número: la siguiente recibe el que le tocaba", async () => {
        const producto = await crearProducto({ data: { name: "Escaso", price: 10, stock: 2 } });
        await vender();

        const rechazada = await vender([{ productId: producto.id, productName: "Escaso", quantity: 3, unitPrice: 10 }]);
        const siguiente = await vender();

        expect(rechazada.status).toBe(409);
        expect(rechazada.body.code).toBe("INSUFFICIENT_AVAILABLE_STOCK");
        expect(siguiente.body.data.number).toBe(2);
        expect(await contador()).toBe(2);
    });

    it("el número tomado en una transacción que se deshace vuelve al contador", async () => {
        // El 409 de arriba salta antes de pedir número. Esto es lo que una secuencia no haría:
        // pedirlo de verdad, fallar después, y que no se haya gastado.
        await vender();

        const fallida = prisma.$transaction(async (tx) => {
            expect(await siguienteNumeroDeVenta(tx)).toBe(2);
            throw new Error("la venta no llega a crearse");
        });
        await expect(fallida).rejects.toThrow("la venta no llega a crearse");

        expect(await contador()).toBe(1);
        expect((await vender()).body.data.number).toBe(2);
    });

    it("borrar una orden pendiente deja un hueco: su número no se vuelve a dar", async () => {
        await vender();
        const borrada = await vender();
        await request(app).delete(`${BASE}/${borrada.body.data.id}`).set("Cookie", cookie).expect(200);

        expect((await vender()).body.data.number).toBe(3);
    });

    it("si falta la fila del contador, la serie sigue desde la última orden y no repite número", async () => {
        await vender();
        await vender();
        await prisma.counter.deleteMany();

        const res = await vender();

        expect(res.status).toBe(201);
        expect(res.body.data.number).toBe(3);
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("dónde se lee", () => {
        it("la nota del movimiento al enviar y al cancelar lleva el número, no el principio del id", async () => {
            const producto = await crearProducto({ data: { name: "Lámpara", price: 10, stock: 5 } });
            const { body } = await vender([{ productId: producto.id, productName: "Lámpara", quantity: 2, unitPrice: 10 }]);
            const id = body.data.id as string;

            await request(app).post(`${BASE}/${id}/ship`).set("Cookie", cookie).expect(200);
            await request(app).patch(`${BASE}/${id}`).set("Cookie", cookie).send({ status: "CANCELLED" }).expect(200);

            const notas = (await prisma.stockMovement.findMany({ where: { productId: producto.id }, orderBy: { createdAt: "asc" } })).map((m) => m.note);
            expect(notas).toEqual(["Orden de venta #000001", "Cancelación de orden de venta #000001"]);
        });

        it("el aviso de venta sin stock trae el número de la orden", async () => {
            const otro = await createUser({ email: "otra-admin@example.com", role: "ADMIN" });
            const producto = await crearProducto({ data: { name: "Teclado", price: 30, stock: 5 } });
            await vender();
            const { body } = await vender([{ productId: producto.id, productName: "Teclado", quantity: 5, unitPrice: 30 }]);
            await ponerStock(producto.id, 3);

            await request(app).post(`${BASE}/${body.data.id}/ship`).set("Cookie", cookie).expect(400);
            await esperarAlertasEnVuelo();

            const avisos = await prisma.notification.findMany({ where: { userId: otro.id } });
            expect(avisos).toHaveLength(1);
            expect(avisos[0]).toMatchObject({
                type: "SALE_UNSHIPPABLE",
                entityId: body.data.id,
                data: { orderNumber: 2, productName: "Teclado", available: 3, required: 5 },
            });
            // A quien lo intentó no se le avisa (T5-12): sigue siendo así.
            expect(await prisma.notification.count({ where: { userId: adminId } })).toBe(0);
        });

        it("un aviso anterior, sin número, sigue siendo válido para la API", async () => {
            // Los avisos ya escritos no se reescriben: llegan sin `orderNumber`.
            await prisma.notification.create({
                data: { userId: adminId, type: "SALE_UNSHIPPABLE", entityId: "3f9a01bc-0000", data: { productName: "X", available: 1, required: 2 } },
            });

            const res = await request(app).get("/api/v1/notifications").set("Cookie", cookie);

            expect(res.status).toBe(200);
            expect(res.body.data.items[0].data).toEqual({ productName: "X", available: 1, required: 2 });
        });

        it("la exportación trae el número con sus ceros, además del id", async () => {
            const { body } = await vender();

            const csv = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);
            const json = await request(app).get(`${BASE}/export`).set("Cookie", cookie);

            const [cabecera, fila] = csv.text.replace(/^﻿/, "").trim().split("\n");
            expect(cabecera!.split(",").slice(0, 2)).toEqual(["orderNumber", "orderId"]);
            expect(fila!.split(",").slice(0, 2)).toEqual(["000001", body.data.id]);
            expect(json.body.data[0]).toMatchObject({ orderNumber: "000001", orderId: body.data.id });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("buscar por número", () => {
        const numerosDe = async (query: string) => {
            const res = await request(app).get(`${BASE}?${query}`).set("Cookie", cookie);
            return { status: res.status, code: res.body.code, numeros: res.body.data?.data.map((o: { number: number }) => o.number), total: res.body.data?.meta.total };
        };

        beforeEach(async () => {
            for (let i = 0; i < 12; i++) await vender();
        });

        it("encuentra la venta exacta: buscar 1 no trae la 10, la 11 ni la 12", async () => {
            expect(await numerosDe("number=1")).toMatchObject({ status: 200, numeros: [1], total: 1 });
            expect(await numerosDe("number=12")).toMatchObject({ numeros: [12], total: 1 });
        });

        it("con ceros a la izquierda es la misma venta", async () => {
            expect(await numerosDe("number=000012")).toMatchObject({ status: 200, numeros: [12] });
        });

        it("un número que no existe da un listado vacío, no un error", async () => {
            expect(await numerosDe("number=999")).toMatchObject({ status: 200, numeros: [], total: 0 });
            expect(await numerosDe("number=0")).toMatchObject({ status: 200, numeros: [] });
        });

        it("se suma a los demás filtros en vez de anularlos", async () => {
            const tercera = await prisma.saleOrder.findUniqueOrThrow({ where: { number: 3 } });
            await prisma.saleOrder.update({ where: { id: tercera.id }, data: { status: "CANCELLED" } });

            expect(await numerosDe("number=3&status=CANCELLED")).toMatchObject({ numeros: [3] });
            expect(await numerosDe("number=3&status=PENDING")).toMatchObject({ numeros: [], total: 0 });
        });

        it("vacío es no filtrar", async () => {
            expect(await numerosDe("number=&limit=50")).toMatchObject({ status: 200, total: 12 });
        });

        it.each([
            ["letras", "number=abc"],
            ["con la almohadilla", "number=%23000012"],
            ["negativo", "number=-1"],
            ["con decimales", "number=1.5"],
            ["más grande que la columna", "number=2147483648"],
            ["repetido", "number=1&number=2"],
        ])("400 si no son solo dígitos: %s", async (_caso, query) => {
            expect(await numerosDe(query)).toMatchObject({ status: 400, code: "INVALID_FILTER_VALUE" });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Se ejecuta **el SQL del propio archivo de migración**, no una copia, por lo mismo que en
     * T5-06: en la CI la migración corre sobre una base vacía y su parte de datos no encuentra
     * ninguna orden.
     */
    describe("la migración de las órdenes que ya existían", () => {
        const MIGRACION = path.join(process.cwd(), "prisma", "migrations", "20261007120000_t6_04_numero_de_venta", "migration.sql");
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

        /**
         * La base de tests ya tiene la columna obligatoria y única, así que «sin numerar» se
         * imita con números altos y **desordenados** respecto a la fecha: si la migración no los
         * tocara, o los ordenara por otra cosa, el resultado no sería 1, 2, 3…
         */
        const antigua = (id: string, createdAt: string, provisional: number) =>
            prisma.saleOrder.create({ data: { warehouseId: ALMACEN, id, number: provisional, createdAt: new Date(createdAt) } });

        const migrar = async () => {
            await prisma.counter.deleteMany();
            for (const sentencia of sentenciasDeDatos()) await prisma.$executeRawUnsafe(sentencia);
        };

        it("la parte de datos son dos sentencias: numerar las órdenes y dejar el contador", () => {
            const sentencias = sentenciasDeDatos();
            expect(sentencias).toHaveLength(2);
            expect(sentencias[0]).toMatch(/UPDATE "sale_orders"/);
            expect(sentencias[1]).toMatch(/INSERT INTO "counters"/);
        });

        it("numera por fecha de creación y, a igualdad, por id; el contador arranca en la última", async () => {
            await antigua("c-marzo", "2026-03-01T10:00:00Z", 9001);
            await antigua("a-enero", "2026-01-01T10:00:00Z", 9003);
            // Dos en el mismo instante: desempata el id.
            await antigua("z-febrero", "2026-02-01T10:00:00Z", 9002);
            await antigua("b-febrero", "2026-02-01T10:00:00Z", 9004);

            await migrar();

            const ordenes = await prisma.saleOrder.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true } });
            expect(ordenes).toEqual([
                { id: "a-enero", number: 1 },
                { id: "b-febrero", number: 2 },
                { id: "z-febrero", number: 3 },
                { id: "c-marzo", number: 4 },
            ]);
            expect(await contador()).toBe(4);
            // La primera venta creada después es la que sigue.
            expect((await vender()).body.data.number).toBe(5);
        });

        it("sobre una base sin órdenes, el contador queda en 0 y la primera venta es la 1", async () => {
            await migrar();

            expect(await contador()).toBe(0);
            expect((await vender()).body.data.number).toBe(1);
        });
    });
});
