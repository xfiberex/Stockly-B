import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { hoyEn, ZONA_HORARIA_POR_DEFECTO } from "@/shared/lib/zonaHoraria";
import { haceDias, masVendidoEntre, ventasPorDia } from "@/shared/lib/ventasEnviadas";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta } from "./helpers";

/**
 * T6-09 — las ventas por día y lo más vendido del panel.
 *
 * Las consultas reciben `hoy` y la zona, así que aquí se fija un día concreto y las fechas de
 * envío se escriben como instantes: es la única forma de comprobar el borde de la medianoche
 * sin depender de la hora a la que corra la suite. Que el plan sea el bueno —por rango del
 * índice y sin ordenar en disco— no lo puede decir un test con diez filas: está medido en
 * `docs/rendimiento.md`.
 */

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/** Santo Domingo va cuatro horas por detrás de UTC todo el año. */
const ZONA = "America/Santo_Domingo";
const HOY = "2026-09-30";

type Linea = [nombre: string, cantidad: number, precio: number, impuesto?: number];

async function venta(status: "PENDING" | "SHIPPED" | "CANCELLED", shippedAt: string | Date | null, lineas: Linea[]) {
    return prisma.saleOrder.create({
        data: {
            number: await numeroDeVenta(),
            status,
            shippedAt: shippedAt ? new Date(shippedAt) : null,
            items: {
                create: lineas.map(([productName, quantity, unitPrice, taxRate]) => ({ productName, quantity, unitPrice, taxRate: taxRate ?? null })),
            },
        },
    });
}

beforeEach(async () => {
    await cleanDb();
});

afterAll(async () => {
    await cleanDb();
});

describe("ventasPorDia (T6-09)", () => {
    it("con ventas hoy y hace tres días devuelve siete días: dos con valor y cinco a cero", async () => {
        await venta("SHIPPED", "2026-09-30T15:00:00Z", [["Teclado", 3, 100]]);
        await venta("SHIPPED", "2026-09-27T15:00:00Z", [["Monitor", 1, 250.5]]);

        const dias = await ventasPorDia(HOY, 7, ZONA);

        expect(dias).toEqual([
            { day: "2026-09-24", orders: 0, revenue: 0 },
            { day: "2026-09-25", orders: 0, revenue: 0 },
            { day: "2026-09-26", orders: 0, revenue: 0 },
            { day: "2026-09-27", orders: 1, revenue: 250.5 },
            { day: "2026-09-28", orders: 0, revenue: 0 },
            { day: "2026-09-29", orders: 0, revenue: 0 },
            { day: "2026-09-30", orders: 1, revenue: 300 },
        ]);
    });

    it("sin ninguna venta siguen siendo siete días, todos a cero", async () => {
        const dias = await ventasPorDia(HOY, 7, ZONA);

        expect(dias).toHaveLength(7);
        expect(dias.every((d) => d.orders === 0 && d.revenue === 0)).toBe(true);
    });

    it("una venta enviada a las 23:30 del negocio cuenta en ese día, no en el siguiente", async () => {
        // Las 23:30 del 27 en Santo Domingo son las 03:30 del 28 en UTC.
        await venta("SHIPPED", "2026-09-28T03:30:00Z", [["Teclado", 1, 40]]);
        // Y media hora después ya es el 28 también allí.
        await venta("SHIPPED", "2026-09-28T04:00:00Z", [["Teclado", 1, 7]]);

        const dias = await ventasPorDia(HOY, 7, ZONA);

        expect(dias.find((d) => d.day === "2026-09-27")).toEqual({ day: "2026-09-27", orders: 1, revenue: 40 });
        expect(dias.find((d) => d.day === "2026-09-28")).toEqual({ day: "2026-09-28", orders: 1, revenue: 7 });
    });

    it("el día lo decide la zona del negocio: el mismo instante cae en otro día en Tokio", async () => {
        // Las 20:00 UTC del 29: las 16:00 del 29 en Santo Domingo y las 05:00 del 30 en Tokio.
        await venta("SHIPPED", "2026-09-29T20:00:00Z", [["Teclado", 1, 10]]);

        const aqui = await ventasPorDia(HOY, 7, ZONA);
        const tokio = await ventasPorDia(HOY, 7, "Asia/Tokyo");

        expect(aqui.find((d) => d.day === "2026-09-29")!.orders).toBe(1);
        expect(tokio.find((d) => d.day === "2026-09-29")!.orders).toBe(0);
        expect(tokio.find((d) => d.day === "2026-09-30")!.orders).toBe(1);
    });

    it("una venta pendiente o cancelada no cuenta, aunque la cancelada llegara a enviarse", async () => {
        await venta("PENDING", null, [["Teclado", 9, 100]]);
        await venta("CANCELLED", "2026-09-30T15:00:00Z", [["Teclado", 9, 100]]);
        await venta("CANCELLED", null, [["Teclado", 9, 100]]);

        const dias = await ventasPorDia(HOY, 7, ZONA);

        expect(dias.every((d) => d.orders === 0 && d.revenue === 0)).toBe(true);
    });

    it("una orden con varias líneas es una orden, y su importe es neto: el impuesto no entra", async () => {
        await venta("SHIPPED", "2026-09-30T15:00:00Z", [["Teclado", 2, 100, 18], ["Cable", 5, 10, 18]]);
        await venta("SHIPPED", "2026-09-30T16:00:00Z", [["Cable", 1, 10]]);

        const hoy = (await ventasPorDia(HOY, 7, ZONA)).at(-1);

        // 2 × 100 + 5 × 10 + 1 × 10 = 260; con el 18 % habrían sido 305.
        expect(hoy).toEqual({ day: HOY, orders: 2, revenue: 260 });
    });

    it("lo enviado antes o después de la ventana queda fuera", async () => {
        // 23:59 del 23 y 00:00 del 1 de octubre, en Santo Domingo.
        await venta("SHIPPED", "2026-09-24T03:59:00Z", [["Teclado", 1, 100]]);
        await venta("SHIPPED", "2026-10-01T04:00:00Z", [["Teclado", 1, 100]]);
        // 00:00 del 24: el primer instante que sí entra.
        await venta("SHIPPED", "2026-09-24T04:00:00Z", [["Cable", 1, 5]]);

        const dias = await ventasPorDia(HOY, 7, ZONA);

        expect(dias.reduce((suma, d) => suma + d.orders, 0)).toBe(1);
        expect(dias[0]).toEqual({ day: "2026-09-24", orders: 1, revenue: 5 });
    });
});

describe("haceDias", () => {
    it("resta días de calendario, cruzando el mes y el año", () => {
        expect(haceDias("2026-09-30", 6)).toBe("2026-09-24");
        expect(haceDias("2026-10-03", 6)).toBe("2026-09-27");
        expect(haceDias("2027-01-02", 6)).toBe("2026-12-27");
        expect(haceDias("2028-03-01", 1)).toBe("2028-02-29");
    });
});

describe("Lo más vendido de la ventana (T6-09)", () => {
    it("ordena por unidades, suma las líneas del mismo producto y se queda con los que se pidan", async () => {
        await venta("SHIPPED", "2026-09-30T15:00:00Z", [["Cable", 4, 10], ["Teclado", 3, 100]]);
        await venta("SHIPPED", "2026-09-25T15:00:00Z", [["Cable", 6, 10], ["Monitor", 1, 250]]);
        // Fuera: de antes de la ventana, pendiente y cancelada.
        await venta("SHIPPED", "2026-09-20T15:00:00Z", [["Monitor", 50, 250]]);
        await venta("PENDING", null, [["Monitor", 50, 250]]);
        await venta("CANCELLED", "2026-09-30T15:00:00Z", [["Monitor", 50, 250]]);

        const top = await masVendidoEntre(haceDias(HOY, 6), HOY, ZONA, 2);

        expect(top).toEqual([
            { nombre: "Cable", unidades: 10, importe: 100 },
            { nombre: "Teclado", unidades: 3, importe: 300 },
        ]);
    });
});

describe("GET /reports — las ventas en el resumen del panel (T6-09)", () => {
    const resumen = async () => {
        const usuario = await createUser({ email: "panel@example.com", role: "USER" });
        return request(app).get("/api/v1/reports").set("Cookie", getAuthCookie(usuario.id));
    };

    it("trae siete días que acaban hoy, en la zona del negocio, y los cinco más vendidos", async () => {
        const ahora = new Date();
        const hoy = hoyEn(ZONA_HORARIA_POR_DEFECTO, ahora);
        await venta("SHIPPED", ahora, [["A", 1, 10], ["B", 2, 10], ["C", 3, 10], ["D", 4, 10], ["E", 5, 10], ["F", 6, 10]]);
        await venta("PENDING", null, [["G", 99, 10]]);

        const res = await resumen();

        expect(res.status).toBe(200);
        const { salesByDay, topSold } = res.body.data;
        expect(salesByDay.map((d: { day: string }) => d.day)).toEqual([6, 5, 4, 3, 2, 1, 0].map((n) => haceDias(hoy, n)));
        expect(salesByDay.at(-1)).toEqual({ day: hoy, orders: 1, revenue: 210 });
        expect(salesByDay.slice(0, 6).every((d: { orders: number }) => d.orders === 0)).toBe(true);
        expect(topSold).toEqual([
            { name: "F", units: 6, revenue: 60 },
            { name: "E", units: 5, revenue: 50 },
            { name: "D", units: 4, revenue: 40 },
            { name: "C", units: 3, revenue: 30 },
            { name: "B", units: 2, revenue: 20 },
        ]);
    });

    it("sin ventas: siete días a cero y ningún producto", async () => {
        const res = await resumen();

        expect(res.body.data.salesByDay).toHaveLength(7);
        expect(res.body.data.salesByDay.every((d: { revenue: number }) => d.revenue === 0)).toBe(true);
        expect(res.body.data.topSold).toEqual([]);
    });
});
