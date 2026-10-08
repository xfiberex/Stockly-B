import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { conTotales, totalesDeLinea } from "@/shared/lib/totalesDeVenta";
import { reunirDatosDelResumen } from "@/shared/lib/resumenSemanal";
import { esTasaDeImpuestoValida, ordenVentaSchema } from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const VENTAS = "/api/v1/sale-orders";
const AJUSTES = "/api/v1/settings";

const linea = (quantity: number, unitPrice: string, taxRate: string | null) => ({
    quantity,
    unitPrice: new Prisma.Decimal(unitPrice),
    taxRate: taxRate === null ? null : new Prisma.Decimal(taxRate),
});

/**
 * T6-05 — impuesto en la venta.
 *
 * Lo que se vigila es lo que SistemaVenta hace y aquí no se copia —que los totales los mande
 * el navegador— y las tres formas de que un impuesto estropee lo que ya había: que cambie una
 * orden ya creada, que infle los informes y que el redondeo no cuadre con sus propias líneas.
 */
describe("Impuesto en la venta (T6-05)", () => {
    let cookie: string;

    beforeEach(async () => {
        await cleanDb();
        const admin = await createUser({ email: "impuesto@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    const ajustar = (cuerpo: Record<string, unknown>) => request(app).patch(AJUSTES).set("Cookie", cookie).send(cuerpo);
    const tasa = async (valor: number) => expect((await ajustar({ taxRate: valor })).status).toBe(200);
    const vender = (items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
        request(app).post(VENTAS).set("Cookie", cookie).send({ items, ...extra });
    const leer = async (id: string) => (await request(app).get(`${VENTAS}/${id}`).set("Cookie", cookie)).body.data;

    // ─────────────────────────────────────────────────────────────────────────
    describe("el redondeo, decidido una vez", () => {
        const importes = (l: ReturnType<typeof linea>) => {
            const t = totalesDeLinea(l);
            return [t.subtotal.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2)];
        };

        it("3 × 100,00 al 18 % son 300,00, 54,00 y 354,00", () => {
            expect(importes(linea(3, "100.00", "18"))).toEqual(["300.00", "54.00", "354.00"]);
        });

        it("el impuesto de la línea se redondea a dos decimales, con el medio hacia arriba", () => {
            // 0,25 al 10 % son 0,025: medio céntimo justo. Hacia arriba, 0,03; al par serían 0,02.
            expect(importes(linea(1, "0.25", "10"))).toEqual(["0.25", "0.03", "0.28"]);
            // 0,0054 baja a 0,01 y 0,0045 a 0,00: no es «siempre hacia arriba».
            expect(importes(linea(1, "0.03", "18"))[1]).toBe("0.01");
            expect(importes(linea(1, "0.03", "15"))[1]).toBe("0.00");
        });

        it("es exacto donde `number` no lo es", () => {
            // En coma flotante 1,15 × 3 es 3,4499999999999997: su 10 % daría 0,34499…, que
            // redondea a 0,34. Exacto son 0,345, medio céntimo, y sube a 0,35.
            expect(importes(linea(3, "1.15", "10"))).toEqual(["3.45", "0.35", "3.80"]);
            // 0,1 + 0,2 no es 0,3 con `number`.
            const orden = conTotales({ items: [linea(1, "0.10", "0"), linea(1, "0.20", "0")] });
            expect(orden.subtotal).toBe("0.30");
        });

        it("sin tasa —una línea anterior a T6-05— o con la tasa a 0, no hay impuesto", () => {
            expect(importes(linea(3, "100.00", null))).toEqual(["300.00", "0.00", "300.00"]);
            expect(importes(linea(3, "100.00", "0"))).toEqual(["300.00", "0.00", "300.00"]);
        });

        it("el impuesto de la orden es la suma del de sus líneas, no el porcentaje del subtotal", () => {
            // Tres líneas de 0,03 al 18 %: cada una redondea a 0,01, y la orden dice 0,03.
            // El 18 % de 0,09 serían 0,02, y el pie no cuadraría con lo que dice cada línea.
            const orden = conTotales({ items: [linea(1, "0.03", "18"), linea(1, "0.03", "18"), linea(1, "0.03", "18")] });

            expect(orden.items.map((i) => i.tax)).toEqual(["0.01", "0.01", "0.01"]);
            expect(orden).toMatchObject({ subtotal: "0.09", tax: "0.03", total: "0.12" });
        });

        it("la tasa sale como número y los importes como cadena con dos decimales", () => {
            const orden = conTotales({ items: [linea(2, "10.00", "7.50"), linea(1, "5.00", null)] });

            expect(orden.items.map((i) => i.taxRate)).toEqual([7.5, null]);
            expect(orden.items[0]).toMatchObject({ subtotal: "20.00", tax: "1.50", total: "21.50" });
            expect(orden).toMatchObject({ subtotal: "25.00", tax: "1.50", total: "26.50" });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("al crear la venta", () => {
        it("con la tasa al 18 %, 3 × 100,00 devuelve subtotal 300,00, impuesto 54,00 y total 354,00", async () => {
            await tasa(18);

            const res = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ subtotal: "300.00", tax: "54.00", total: "354.00" });
            expect(res.body.data.items[0]).toMatchObject({ taxRate: 18, subtotal: "300.00", tax: "54.00", total: "354.00" });
            expect(ordenVentaSchema.safeParse(res.body.data).success).toBe(true);
            // El precio guardado sigue siendo sin impuesto.
            const guardada = await prisma.saleOrderItem.findFirstOrThrow();
            expect(guardada.unitPrice.toFixed(2)).toBe("100.00");
            expect(guardada.taxRate?.toFixed(2)).toBe("18.00");
        });

        it("sin tocar nada la tasa es 0: no hay impuesto y el total es el de siempre", async () => {
            const res = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            expect(res.body.data).toMatchObject({ subtotal: "300.00", tax: "0.00", total: "300.00" });
            expect(res.body.data.items[0].taxRate).toBe(0);
        });

        it("una petición que manda sus propios totales, o su tasa, no consigue que se guarden", async () => {
            await tasa(18);

            const res = await vender(
                [{ productName: "Servicio", quantity: 3, unitPrice: 100, taxRate: 0, tax: 0, subtotal: 1, total: 1 }],
                { subtotal: 1, tax: 0, total: 1, taxRate: 0 },
            );

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ subtotal: "300.00", tax: "54.00", total: "354.00" });
            expect((await leer(res.body.data.id)).total).toBe("354.00");
            expect((await prisma.saleOrderItem.findFirstOrThrow()).taxRate?.toNumber()).toBe(18);
        });

        it("tampoco al editarla: el PATCH no acepta totales ni toca la tasa", async () => {
            await tasa(18);
            const { body } = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            const res = await request(app).patch(`${VENTAS}/${body.data.id}`).set("Cookie", cookie).send({ notes: "x", total: 1, tax: 0 });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ notes: "x", subtotal: "300.00", tax: "54.00", total: "354.00" });
        });

        it("subir después la tasa al 20 % no altera esa orden; la siguiente sí nace con el 20", async () => {
            await tasa(18);
            const antes = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            await tasa(20);
            const despues = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            expect(await leer(antes.body.data.id)).toMatchObject({ tax: "54.00", total: "354.00" });
            expect(despues.body.data).toMatchObject({ tax: "60.00", total: "360.00" });
            // También en el listado, que es lo que pinta la pantalla.
            const lista = await request(app).get(VENTAS).set("Cookie", cookie);
            expect(lista.body.data.data.map((o: { total: string }) => o.total)).toEqual(["360.00", "354.00"]);
        });

        it("quitar el impuesto tampoco lo quita de las órdenes que ya lo llevan", async () => {
            await tasa(18);
            const { body } = await vender([{ productName: "Servicio", quantity: 1, unitPrice: 100 }]);

            await tasa(0);

            expect((await leer(body.data.id)).total).toBe("118.00");
        });

        it("enviar y cancelar devuelven los mismos importes", async () => {
            await tasa(18);
            const producto = await prisma.product.create({ data: { name: "Lámpara", price: 100, stock: 5 } });
            const { body } = await vender([{ productId: producto.id, productName: "Lámpara", quantity: 3, unitPrice: 100 }]);

            const enviada = await request(app).post(`${VENTAS}/${body.data.id}/ship`).set("Cookie", cookie);
            const cancelada = await request(app).patch(`${VENTAS}/${body.data.id}`).set("Cookie", cookie).send({ status: "CANCELLED" });

            expect(enviada.body.data).toMatchObject({ status: "SHIPPED", total: "354.00" });
            expect(cancelada.body.data).toMatchObject({ status: "CANCELLED", tax: "54.00", total: "354.00" });
        });

        it("una orden anterior, con sus líneas sin tasa, se lee sin impuesto", async () => {
            await tasa(18);
            const antigua = await prisma.saleOrder.create({
                data: { number: await numeroDeVenta(), items: { create: [{ productName: "De antes", quantity: 2, unitPrice: 50 }] } },
            });

            const orden = await leer(antigua.id);

            expect(orden).toMatchObject({ subtotal: "100.00", tax: "0.00", total: "100.00" });
            expect(orden.items[0].taxRate).toBeNull();
        });

        it("una tasa estropeada a mano en la base se lee como 0, no multiplica la venta", async () => {
            await prisma.appSetting.create({ data: { key: "taxRate", value: "250" } });

            const res = await vender([{ productName: "Servicio", quantity: 1, unitPrice: 100 }]);

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ tax: "0.00", total: "100.00" });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que sigue en neto", () => {
        /** Vende y envía 3 × 100 de un producto que cuesta 60, y devuelve el margen de `/reports`. */
        async function margenCon(porcentaje: number) {
            await prisma.saleOrderItem.deleteMany();
            await prisma.saleOrder.deleteMany();
            await prisma.stockMovement.deleteMany();
            await prisma.product.deleteMany();
            await tasa(porcentaje);
            const producto = await prisma.product.create({ data: { name: "Taladro", price: 100, stock: 10, costPrice: 60 } });
            const { body } = await vender([{ productId: producto.id, productName: "Taladro", quantity: 3, unitPrice: 100 }]);
            await request(app).post(`${VENTAS}/${body.data.id}/ship`).set("Cookie", cookie).expect(200);
            expect(body.data.tax).toBe((3 * porcentaje).toFixed(2));

            const res = await request(app).get("/api/v1/reports").set("Cookie", cookie);
            expect(res.status).toBe(200);
            // El producto se crea de nuevo en cada pasada: su id es lo único que puede diferir.
            const { topProducts, ...margen } = res.body.data.margin;
            return { ...margen, topProducts: topProducts.map(({ productId: _id, ...p }: { productId: string }) => p) };
        }

        it("el margen de la venta en /reports es el mismo con la tasa al 18 % que a 0", async () => {
            const sinImpuesto = await margenCon(0);
            const conImpuesto = await margenCon(18);

            expect(sinImpuesto.revenue).toBe(300);
            expect(sinImpuesto.margin).toBe(120);
            expect(conImpuesto).toEqual(sinImpuesto);
        });

        it("la ficha del cliente y el resumen semanal siguen sumando sin impuesto", async () => {
            await tasa(18);
            const { body } = await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }], { customerEmail: "ana@correo.com", customerName: "Ana" });
            const pendientes = (await reunirDatosDelResumen({ from: "2026-01-01", to: "2026-01-07" }, "UTC", "2026-01-08")).pendientes;
            await request(app).post(`${VENTAS}/${body.data.id}/ship`).set("Cookie", cookie).expect(200);

            const ficha = await request(app).get(`/api/v1/customers/${body.data.customerId}`).set("Cookie", cookie);

            expect(ficha.body.data.summary.shippedRevenue).toBe(300);
            expect(pendientes.ordenes[0]!.importe).toBe(300);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la exportación", () => {
        it("conserva `totalLine` sin impuesto y añade la tasa, el impuesto y el total con él", async () => {
            await tasa(18);
            await vender([{ productName: "Servicio", quantity: 3, unitPrice: 100 }]);

            const csv = await request(app).get(`${VENTAS}/export?format=csv`).set("Cookie", cookie);
            const json = await request(app).get(`${VENTAS}/export`).set("Cookie", cookie);

            const [cabecera, fila] = csv.text.replace(/^﻿/, "").trim().split("\n");
            expect(cabecera!.split(",").slice(-5)).toEqual(["unitPrice", "totalLine", "taxRate", "taxLine", "totalLineWithTax"]);
            expect(fila!.split(",").slice(-5)).toEqual(["100", "300", "18", "54", "354"]);
            expect(json.body.data[0]).toMatchObject({ totalLine: 300, taxRate: 18, taxLine: 54, totalLineWithTax: 354 });
        });

        it("una línea sin tasa sale con la tasa vacía, no con un 0 que no tuvo", async () => {
            await prisma.saleOrder.create({
                data: { number: await numeroDeVenta(), items: { create: [{ productName: "De antes", quantity: 2, unitPrice: 50 }] } },
            });

            const json = await request(app).get(`${VENTAS}/export`).set("Cookie", cookie);

            expect(json.body.data[0]).toMatchObject({ totalLine: 100, taxRate: "", taxLine: 0, totalLineWithTax: 100 });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("los dos ajustes", () => {
        it("nacen en 0 y sin nombre, en el grupo del negocio", async () => {
            const res = await request(app).get(AJUSTES).set("Cookie", cookie);
            const porClave = new Map(res.body.data.map((a: { key: string }) => [a.key, a]));

            expect(porClave.get("taxRate")).toMatchObject({ type: "number", value: 0, group: "business" });
            expect(porClave.get("taxName")).toMatchObject({ type: "string", value: "", group: "business", maxLength: 20 });
        });

        it.each([0, 18, 7.5, 10.25, 100])("acepta %s como tasa", async (valor) => {
            const res = await ajustar({ taxRate: valor });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([{ key: "taxRate", value: valor }]);
        });

        it.each([
            ["negativa", -1],
            ["por encima de 100", 100.01],
            ["con tres decimales", 18.125],
            ["como texto", "18"],
        ])("422 con una tasa %s, y no se guarda", async (_caso, valor) => {
            const res = await ajustar({ taxRate: valor });

            expect(res.status).toBe(422);
            expect(await prisma.appSetting.count({ where: { key: "taxRate" } })).toBe(0);
        });

        it("la regla es la del contrato, la misma que usa el formulario", () => {
            expect([0, 18, 7.5, 10.25, 100, 0.07, 19.99].every(esTasaDeImpuestoValida)).toBe(true);
            expect([-0.01, 100.01, 18.125, Number.NaN, Number.POSITIVE_INFINITY].some(esTasaDeImpuestoValida)).toBe(false);
        });

        it("el nombre y la tasa vigente los lee cualquier rol en GET /settings/business", async () => {
            const lector = await createUser({ email: "lector@example.com", role: "USER" });
            await ajustar({ taxName: "  ITBIS ", taxRate: 18 });

            const res = await request(app).get(`${AJUSTES}/business`).set("Cookie", getAuthCookie(lector.id));

            expect(res.body.data.taxName).toBe("ITBIS");
            // T6-08 — la tasa no iba aquí. Ahora va: el mostrador tiene que decir cuánto se va a
            // cobrar antes de registrar la venta. Es la vigente, no la de ninguna orden.
            expect(res.body.data.taxRate).toBe(18);
        });

        it("una tasa estropeada a mano en la tabla se lee como 0 también ahí", async () => {
            const lector = await createUser({ email: "lector@example.com", role: "USER" });
            await prisma.appSetting.create({ data: { key: "taxRate", value: "250" } });

            const res = await request(app).get(`${AJUSTES}/business`).set("Cookie", getAuthCookie(lector.id));

            expect(res.body.data.taxRate).toBe(0);
        });

        it("422 con un nombre de más de 20 caracteres", async () => {
            expect((await ajustar({ taxName: "x".repeat(21) })).status).toBe(422);
        });
    });
});
