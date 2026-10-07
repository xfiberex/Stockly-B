import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { hoyEn, ZONA_HORARIA_POR_DEFECTO } from "@/shared/lib/zonaHoraria";
import { mesesDe, periodoDeAtajo, resolverPeriodo } from "@/modules/reports/reports.periodo";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-09 — ventas y compras por periodo.
 *
 * Lo que se vigila es **dónde empieza cada mes**. Las fechas se guardan en UTC y el mes es el del
 * negocio: en Santo Domingo (UTC−4) una venta del 31 de marzo a las 23:30 se guarda el 1 de abril
 * a las 03:30 UTC, y agrupar por la fecha guardada la contaría en abril. Por eso los instantes de
 * este archivo se escriben en UTC con su hora local al lado.
 */

const PERIODO = "/api/v1/reports/period";
const COMPRAS = "/api/v1/purchase-orders";

describe("Informes por periodo (T5-09)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "periodo_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.costHistory.deleteMany();
        await prisma.purchaseOrderItem.deleteMany();
        await prisma.purchaseOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.appSetting.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const informe = async (consulta: string) => {
        const res = await request(app).get(`${PERIODO}?${consulta}`).set("Cookie", cookie);
        expect(res.status).toBe(200);
        return res.body.data;
    };

    const producto = (name: string, extra: { categoryId?: string } = {}) =>
        prisma.product.create({ data: { name, price: 20, stock: 100, ...extra } });

    /** Una venta enviada en `shippedAt`, directamente en la base para fijar el instante exacto. */
    async function venta(shippedAt: string, items: Array<{ productId?: string; productName: string; quantity: number; unitPrice: number }>, status: "SHIPPED" | "CANCELLED" | "PENDING" = "SHIPPED") {
        return prisma.saleOrder.create({
            data: { number: await numeroDeVenta(), status, shippedAt: status === "PENDING" ? null : new Date(shippedAt), items: { create: items } },
        });
    }

    /**
     * Una compra recibida por la API en varias entregas, cada una fechada en su instante: la
     * recepción real escribe `now()`, y aquí se mueve después la entrada recién creada.
     */
    async function compra(p: { id: string; name: string }, cantidad: number, unitPrice: number, entregas: Array<{ cantidad: number; en: string }>) {
        const creada = await request(app)
            .post(COMPRAS)
            .set("Cookie", cookie)
            .send({ items: [{ productId: p.id, productName: p.name, quantity: cantidad, unitPrice }] });
        expect(creada.status).toBe(201);
        const id = creada.body.data.id as string;
        const linea = creada.body.data.items[0].id as string;

        for (const entrega of entregas) {
            const antes = new Date();
            const res = await request(app).post(`${COMPRAS}/${id}/receipts`).set("Cookie", cookie).send({ items: [{ itemId: linea, quantity: entrega.cantidad }] });
            expect(res.status).toBe(201);
            const movida = await prisma.stockMovement.updateMany({
                where: { purchaseOrderItemId: linea, createdAt: { gte: new Date(antes.getTime() - 1000) } },
                data: { createdAt: new Date(entrega.en) },
            });
            expect(movida.count).toBe(1);
        }
        return { id, linea };
    }

    describe("El borde del mes, en la zona del negocio", () => {
        it("una venta enviada el 31 de marzo a las 23:30 hora local cae en marzo, no en abril", async () => {
            const p = await producto("Teclado");
            // 23:30 del 31 de marzo en Santo Domingo = 03:30 UTC del 1 de abril.
            await venta("2026-04-01T03:30:00Z", [{ productId: p.id, productName: p.name, quantity: 2, unitPrice: 10 }]);

            const marzo = await informe("from=2026-03-01&to=2026-03-31");
            const abril = await informe("from=2026-04-01&to=2026-04-30");

            expect(marzo.totals.salesUnits).toBe(2);
            expect(marzo.totals.salesRevenue).toBe(20);
            expect(abril.totals.salesUnits).toBe(0);
            expect(marzo.timezone).toBe(ZONA_HORARIA_POR_DEFECTO);
        });

        it("el primer instante del mes local entra y el último del anterior no", async () => {
            const p = await producto("Ratón");
            // 00:00:00 del 1 de abril en Santo Domingo = 04:00 UTC.
            await venta("2026-04-01T04:00:00Z", [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 5 }]);
            // 23:59:59 del 31 de marzo en Santo Domingo = 03:59:59 UTC del 1 de abril.
            await venta("2026-04-01T03:59:59Z", [{ productId: p.id, productName: p.name, quantity: 7, unitPrice: 5 }]);

            const abril = await informe("from=2026-04-01&to=2026-04-30");

            expect(abril.totals.salesUnits).toBe(1);
        });

        it("con otra zona en el ajuste, la misma venta cambia de mes", async () => {
            const p = await producto("Monitor");
            await venta("2026-04-01T03:30:00Z", [{ productId: p.id, productName: p.name, quantity: 3, unitPrice: 10 }]);

            const ajuste = await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ timezone: "UTC" });
            expect(ajuste.status).toBe(200);

            // En UTC son las 03:30 del 1 de abril: ahora es de abril.
            expect((await informe("from=2026-03-01&to=2026-03-31")).totals.salesUnits).toBe(0);
            expect((await informe("from=2026-04-01&to=2026-04-30")).totals.salesUnits).toBe(3);
        });

        it("en una zona con horario de verano, cada mes empieza a su hora: invierno y verano", async () => {
            // Nueva York es UTC−5 en enero y UTC−4 en marzo, tras el cambio del 8 de marzo. Un
            // desfase fijo acertaría en uno de los dos bordes y fallaría en el otro.
            await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ timezone: "America/New_York" });
            const p = await producto("Cable");
            // 23:30 del 31 de enero (EST, −5) = 04:30 UTC del 1 de febrero.
            await venta("2026-02-01T04:30:00Z", [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 1 }]);
            // 23:30 del 31 de marzo (EDT, −4) = 03:30 UTC del 1 de abril.
            await venta("2026-04-01T03:30:00Z", [{ productId: p.id, productName: p.name, quantity: 10, unitPrice: 1 }]);

            const { byMonth } = await informe("from=2026-01-01&to=2026-04-30");

            expect(byMonth.map((m: { month: string; salesUnits: number }) => [m.month, m.salesUnits])).toEqual([
                ["2026-01", 1],
                ["2026-02", 0],
                ["2026-03", 10],
                ["2026-04", 0],
            ]);
        });
    });

    describe("La suma de los meses es el trimestre", () => {
        it("ventas y compras de enero, febrero y marzo suman lo mismo que el primer trimestre", async () => {
            const cat = await prisma.category.create({ data: { name: "Periféricos" } });
            const a = await producto("Auriculares", { categoryId: cat.id });
            const b = await producto("Webcam");

            // Primer instante del año local (00:00 del 1 de enero = 04:00 UTC).
            await venta("2026-01-01T04:00:00Z", [{ productId: a.id, productName: a.name, quantity: 1, unitPrice: 19.99 }]);
            await venta("2026-02-14T18:00:00Z", [
                { productId: a.id, productName: a.name, quantity: 3, unitPrice: 19.99 },
                { productId: b.id, productName: b.name, quantity: 2, unitPrice: 45.5 },
            ]);
            // Último instante del trimestre local: 23:30 del 31 de marzo.
            await venta("2026-04-01T03:30:00Z", [{ productId: b.id, productName: b.name, quantity: 1, unitPrice: 45.5 }]);
            // Fuera, por un minuto a cada lado.
            await venta("2026-01-01T03:59:00Z", [{ productId: a.id, productName: a.name, quantity: 100, unitPrice: 1 }]);
            await venta("2026-04-01T04:01:00Z", [{ productId: a.id, productName: a.name, quantity: 100, unitPrice: 1 }]);
            // Recibida a medias en dos meses: cada parte en el suyo.
            await compra(a, 50, 8.25, [
                { cantidad: 20, en: "2026-02-10T15:00:00Z" },
                { cantidad: 30, en: "2026-03-20T15:00:00Z" },
            ]);

            const trimestre = await informe("from=2026-01-01&to=2026-03-31");
            const meses = await Promise.all(
                ["from=2026-01-01&to=2026-01-31", "from=2026-02-01&to=2026-02-28", "from=2026-03-01&to=2026-03-31"].map(informe),
            );

            const suma = (campo: string) => meses.reduce((total, m) => total + m.totals[campo], 0);
            for (const campo of ["salesOrders", "salesUnits", "purchaseUnits", "purchaseOrders"]) {
                // `purchaseOrders` cuenta órdenes distintas: la de dos entregas está en dos
                // meses, así que ahí la suma de los meses es mayor. Se comprueba aparte.
                if (campo === "purchaseOrders") continue;
                expect(suma(campo)).toBe(trimestre.totals[campo]);
            }
            expect(suma("salesRevenue")).toBeCloseTo(trimestre.totals.salesRevenue, 2);
            expect(suma("purchaseAmount")).toBeCloseTo(trimestre.totals.purchaseAmount, 2);

            // Las cifras, a mano: 1 + 3 + 2 + 1 unidades; 4 × 19.99 + 3 × 45.5.
            expect(trimestre.totals).toEqual({
                salesOrders: 3,
                salesUnits: 7,
                salesRevenue: 216.46,
                purchaseOrders: 1,
                purchaseUnits: 50,
                purchaseAmount: 412.5,
            });
            expect(meses.map((m) => m.totals.purchaseOrders)).toEqual([0, 1, 1]);

            // El desglose por meses del trimestre dice lo mismo que las tres consultas sueltas.
            expect(trimestre.byMonth.map((m: { salesUnits: number; purchaseUnits: number }) => [m.salesUnits, m.purchaseUnits])).toEqual(
                meses.map((m) => [m.totals.salesUnits, m.totals.purchaseUnits]),
            );
        });
    });

    describe("Qué cuenta", () => {
        it("solo las ventas enviadas: ni las pendientes ni las canceladas después de enviarse", async () => {
            const p = await producto("Hub");
            await venta("2026-05-10T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 10 }]);
            await venta("2026-05-11T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 5, unitPrice: 10 }], "CANCELLED");
            await venta("2026-05-12T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 9, unitPrice: 10 }], "PENDING");

            const { totals } = await informe("from=2026-05-01&to=2026-05-31");

            expect(totals.salesUnits).toBe(1);
            expect(totals.salesOrders).toBe(1);
        });

        it("las compras de una orden cancelada no cuentan: la cancelación sacó lo recibido", async () => {
            const p = await producto("Disco");
            const { id } = await compra(p, 10, 3, [{ cantidad: 4, en: "2026-05-05T12:00:00Z" }]);
            await request(app).patch(`${COMPRAS}/${id}`).set("Cookie", cookie).send({ status: "CANCELLED" });

            const { totals } = await informe("from=2026-05-01&to=2026-05-31");

            expect(totals.purchaseUnits).toBe(0);
        });

        it("la recepción deja la línea en su movimiento de entrada", async () => {
            const p = await producto("Router");
            const { linea } = await compra(p, 10, 3, [{ cantidad: 6, en: "2026-05-05T12:00:00Z" }]);

            const entradas = await prisma.stockMovement.findMany({ where: { productId: p.id, type: "IN" } });

            expect(entradas).toHaveLength(1);
            expect(entradas[0]!.purchaseOrderItemId).toBe(linea);
        });

        it("un producto solo comprado sale con sus compras y ventas a cero, y sin categoría como null", async () => {
            const cat = await prisma.category.create({ data: { name: "Redes" } });
            const vendido = await producto("Switch", { categoryId: cat.id });
            const comprado = await producto("Antena");
            await venta("2026-06-10T12:00:00Z", [
                { productId: vendido.id, productName: vendido.name, quantity: 2, unitPrice: 30 },
                // Escrito a mano, sin producto: cuenta como venta con su nombre.
                { productName: "Instalación", quantity: 1, unitPrice: 15 },
            ]);
            await compra(comprado, 5, 4, [{ cantidad: 5, en: "2026-06-11T12:00:00Z" }]);

            const datos = await informe("from=2026-06-01&to=2026-06-30");

            expect(datos.byProduct).toEqual([
                { productId: vendido.id, name: "Switch", sku: null, category: "Redes", salesUnits: 2, salesRevenue: 60, purchaseUnits: 0, purchaseAmount: 0 },
                { productId: null, name: "Instalación", sku: null, category: null, salesUnits: 1, salesRevenue: 15, purchaseUnits: 0, purchaseAmount: 0 },
                { productId: comprado.id, name: "Antena", sku: null, category: null, salesUnits: 0, salesRevenue: 0, purchaseUnits: 5, purchaseAmount: 20 },
            ]);
            expect(datos.moreProducts).toBe(false);
            expect(datos.byCategory).toEqual([
                { name: "Redes", salesUnits: 2, salesRevenue: 60, purchaseUnits: 0, purchaseAmount: 0 },
                { name: null, salesUnits: 1, salesRevenue: 15, purchaseUnits: 5, purchaseAmount: 20 },
            ]);
        });

        it("con más de 50 productos enseña los 50 que más venden y avisa de que hay más", async () => {
            const productos = await Promise.all(Array.from({ length: 51 }, (_, i) => producto(`P${String(i).padStart(2, "0")}`)));
            // El producto i vende i + 1 unidades a 1: el que menos vende es P00, con 1.
            await venta("2026-08-10T12:00:00Z", productos.map((p, i) => ({ productId: p.id, productName: p.name, quantity: i + 1, unitPrice: 1 })));

            const datos = await informe("from=2026-08-01&to=2026-08-31");

            expect(datos.byProduct).toHaveLength(50);
            expect(datos.moreProducts).toBe(true);
            expect(datos.byProduct[0].name).toBe("P50");
            expect(datos.byProduct.map((p: { name: string }) => p.name)).not.toContain("P00");
        });

        it("un mes sin actividad sale con ceros, no desaparece", async () => {
            const { byMonth } = await informe("from=2026-02-15&to=2026-04-10");

            expect(byMonth).toEqual([
                { month: "2026-02", salesUnits: 0, salesRevenue: 0, purchaseUnits: 0, purchaseAmount: 0 },
                { month: "2026-03", salesUnits: 0, salesRevenue: 0, purchaseUnits: 0, purchaseAmount: 0 },
                { month: "2026-04", salesUnits: 0, salesRevenue: 0, purchaseUnits: 0, purchaseAmount: 0 },
            ]);
        });

        it("los meses de los extremos se recortan a los días del periodo", async () => {
            const p = await producto("Tableta");
            await venta("2026-02-10T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 4, unitPrice: 1 }]);
            await venta("2026-02-20T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 1 }]);

            const { byMonth } = await informe("from=2026-02-15&to=2026-03-31");

            expect(byMonth[0]).toMatchObject({ month: "2026-02", salesUnits: 1 });
        });
    });

    describe("Atajos y validación", () => {
        it("sin nada, este mes del negocio", async () => {
            const datos = await informe("");
            const hoy = hoyEn(ZONA_HORARIA_POR_DEFECTO);

            expect(datos.preset).toBe("this-month");
            expect(datos.from).toBe(`${hoy.slice(0, 7)}-01`);
            expect(datos.byMonth).toHaveLength(1);
        });

        it("los atajos, contados desde hoy", () => {
            expect(periodoDeAtajo("this-month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29", preset: "this-month" });
            // Enero: el mes anterior es diciembre del año anterior.
            expect(periodoDeAtajo("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31", preset: "last-month" });
            expect(periodoDeAtajo("this-quarter", "2026-08-31")).toEqual({ from: "2026-07-01", to: "2026-09-30", preset: "this-quarter" });
            expect(periodoDeAtajo("this-quarter", "2026-03-31")).toEqual({ from: "2026-01-01", to: "2026-03-31", preset: "this-quarter" });
            expect(periodoDeAtajo("this-year", "2026-12-31")).toEqual({ from: "2026-01-01", to: "2026-12-31", preset: "this-year" });
        });

        it("los meses de un periodo cruzan el cambio de año", () => {
            expect(mesesDe("2025-11-20", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
            expect(mesesDe("2026-05-01", "2026-05-31")).toEqual(["2026-05"]);
        });

        it("«hoy» es el del negocio: a las 23:30 del 31 de marzo en Santo Domingo sigue siendo marzo", () => {
            const hoy = hoyEn(ZONA_HORARIA_POR_DEFECTO, new Date("2026-04-01T03:30:00Z"));

            expect(hoy).toBe("2026-03-31");
            expect(resolverPeriodo({ preset: "this-month" }, hoy).from).toBe("2026-03-01");
        });

        it.each([
            ["from=2026-02-30&to=2026-03-01", "un día que no existe"],
            ["from=2026-3-1&to=2026-03-31", "sin ceros"],
            ["from=2026-03-01", "sin fin"],
            ["from=2026-04-01&to=2026-03-01", "fin antes del inicio"],
            ["from=2020-01-01&to=2025-01-01", "más de 60 meses"],
            ["preset=last-week", "un atajo que no existe"],
            ["preset=this-month&from=2026-01-01&to=2026-01-31", "atajo y rango a la vez"],
        ])("400 con %s (%s)", async (consulta) => {
            const res = await request(app).get(`${PERIODO}?${consulta}`).set("Cookie", cookie);

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INVALID_FILTER_VALUE");
        });

        it("60 meses justos sí se aceptan", async () => {
            const datos = await informe("from=2021-01-01&to=2025-12-31");

            expect(datos.byMonth).toHaveLength(60);
        });

        it("401 sin sesión", async () => {
            expect((await request(app).get(PERIODO)).status).toBe(401);
        });
    });

    describe("El ajuste de zona horaria", () => {
        it("por defecto es la de República Dominicana", async () => {
            const res = await request(app).get("/api/v1/settings").set("Cookie", cookie);

            expect(res.body.data.find((a: { key: string }) => a.key === "timezone")).toMatchObject({
                type: "string",
                value: "America/Santo_Domingo",
            });
        });

        it("rechaza un nombre que no es una zona IANA", async () => {
            const res = await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ timezone: "Hora de Santo Domingo" });

            expect(res.status).toBe(422);
        });

        it("guarda la forma canónica aunque llegue en minúsculas", async () => {
            const res = await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ timezone: "america/mexico_city" });

            expect(res.status).toBe(200);
            expect((await prisma.appSetting.findUnique({ where: { key: "timezone" } }))?.value).toBe("America/Mexico_City");
        });

        it("si la guardada no es válida —editada a mano—, usa la de por defecto en vez de fallar", async () => {
            await prisma.appSetting.create({ data: { key: "timezone", value: "Marte/Olympus" } });

            const datos = await informe("preset=this-month");

            expect(datos.timezone).toBe(ZONA_HORARIA_POR_DEFECTO);
        });
    });

    describe("Exportación", () => {
        it("CSV con una fila por producto y todos, no solo los de pantalla", async () => {
            const p = await producto("Lámpara");
            await venta("2026-07-10T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 3, unitPrice: 12.5 }]);

            const res = await request(app).get(`${PERIODO}?from=2026-07-01&to=2026-07-31&format=csv`).set("Cookie", cookie);

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("text/csv");
            expect(res.headers["content-disposition"]).toContain("informe-2026-07-01-2026-07-31.csv");
            const [cabecera, fila] = res.text.replace(/^﻿/, "").split("\n");
            expect(cabecera).toBe("productName,productSku,category,salesUnits,salesRevenue,purchaseUnits,purchaseAmount");
            expect(fila).toBe("Lámpara,,,3,37.5,0,0");
        });

        it("PDF", async () => {
            const p = await producto("Silla");
            await venta("2026-07-10T12:00:00Z", [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 80 }]);

            const res = await request(app)
                .get(`${PERIODO}?from=2026-07-01&to=2026-07-31&format=pdf`)
                .set("Cookie", cookie)
                .buffer(true)
                .parse((r, cb) => {
                    const trozos: Buffer[] = [];
                    r.on("data", (t: Buffer) => trozos.push(t));
                    r.on("end", () => cb(null, Buffer.concat(trozos)));
                });

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toBe("application/pdf");
            expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
        });
    });

    describe("El gráfico de movimientos por mes del dashboard", () => {
        it("son seis meses naturales del negocio, y el más antiguo va entero desde su primer instante", async () => {
            const p = await producto("Estantería");
            const [anio, mes] = hoyEn(ZONA_HORARIA_POR_DEFECTO).split("-").map(Number);
            // Primer instante del mes de hace cinco meses en Santo Domingo (00:00 local = 04:00 UTC),
            // y un minuto antes, que es del mes anterior y no sale en el gráfico.
            const primerInstante = new Date(Date.UTC(anio!, mes! - 6, 1, 4, 0, 0));
            const unMinutoAntes = new Date(primerInstante.getTime() - 60_000);
            await prisma.stockMovement.createMany({
                data: [
                    { productId: p.id, type: "ADJUSTMENT", delta: 1, stockAfter: 1, createdAt: primerInstante },
                    { productId: p.id, type: "ADJUSTMENT", delta: 1, stockAfter: 2, createdAt: unMinutoAntes },
                ],
            });

            const res = await request(app).get("/api/v1/reports").set("Cookie", cookie);
            const filas = res.body.data.movementsByMonth as Array<{ month: string; type: string; total: number }>;

            const primerMes = new Date(Date.UTC(anio!, mes! - 6, 1)).toISOString().slice(0, 7);
            const ajustes = filas.filter((f) => f.type === "ADJUSTMENT");
            expect(ajustes).toEqual([{ month: primerMes, type: "ADJUSTMENT", total: 1 }]);
        });
    });
});
