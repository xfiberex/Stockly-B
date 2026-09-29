import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { hoyEn, ZONA_HORARIA_POR_DEFECTO } from "@/shared/lib/zonaHoraria";
import { abcService, periodoAbc, VIGENCIA_ABC_MS } from "@/modules/reports/reports.abc";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-10 — clasificación ABC.
 *
 * Las cifras de cada caso están elegidas para que las clases se puedan calcular a mano sobre un
 * total de 100: el porcentaje de cada producto es su facturación. Las ventas caen en el mes
 * pasado, que siempre está dentro del periodo (los doce meses completos anteriores al actual).
 */

const PRODUCTOS = "/api/v1/products";
const RESUMEN = "/api/v1/reports/abc";

/** Medianoche local de Santo Domingo (UTC−4) del día dado, como instante UTC. */
const medianocheLocal = (dia: string) => new Date(`${dia}T04:00:00.000Z`);

describe("Clasificación ABC (T5-10)", () => {
    let cookie: string;
    let periodo: { from: string; to: string };
    /** Un instante del mes pasado, dentro del periodo pase lo que pase hoy. */
    let enElPeriodo: Date;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "abc_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
        periodo = periodoAbc(hoyEn(ZONA_HORARIA_POR_DEFECTO));
        enElPeriodo = new Date(medianocheLocal(periodo.to).getTime() - 10 * 24 * 60 * 60 * 1000);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.abcCalculation.deleteMany();
        await prisma.appSetting.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const producto = (name: string) => prisma.product.create({ data: { name, price: 1, stock: 100 } });

    /** Una venta de una línea: `importe` unidades a 1 €, para que las cifras se lean directas. */
    const venta = (
        productId: string,
        importe: number,
        { status = "SHIPPED", shippedAt = enElPeriodo }: { status?: "SHIPPED" | "PENDING" | "CANCELLED"; shippedAt?: Date } = {},
    ) =>
        prisma.saleOrder.create({
            data: {
                status,
                shippedAt: status === "PENDING" ? null : shippedAt,
                items: { create: [{ productId, productName: "x", quantity: importe, unitPrice: 1 }] },
            },
        });

    /** Productos con esas facturaciones, en ese orden, y la clase que les da el catálogo. */
    async function clasificar(importes: number[]) {
        const productos = [];
        for (const [i, importe] of importes.entries()) {
            const p = await producto(`P${i + 1}`);
            if (importe > 0) await venta(p.id, importe);
            productos.push(p);
        }
        const res = await request(app).get(`${PRODUCTOS}?limit=100&isActive=true`).set("Cookie", cookie);
        expect(res.status).toBe(200);
        const clase = new Map<string, string>(res.body.data.data.map((p: { id: string; abcClass: string }) => [p.id, p.abcClass]));
        return productos.map((p) => clase.get(p.id));
    }

    describe("el periodo", () => {
        it("son los doce meses naturales completos anteriores al actual", () => {
            expect(periodoAbc("2026-09-29")).toEqual({ from: "2025-09-01", to: "2026-08-31" });
            expect(periodoAbc("2026-03-01")).toEqual({ from: "2025-03-01", to: "2026-02-28" });
        });

        it("en enero, el año anterior entero", () => {
            expect(periodoAbc("2026-01-15")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
        });
    });

    describe("las clases coinciden con el cálculo a mano", () => {
        it("A hasta el 80 % acumulado, B hasta el 95 %, C el resto; el que cae justo en el 80 % es A", async () => {
            // Acumulado: 50, 80, 95, 99, 100. P2 llega justo al 80 y P3 justo al 95.
            expect(await clasificar([50, 30, 15, 4, 1])).toEqual(["A", "A", "B", "C", "C"]);
        });

        it("el que cruza el 80 % es A: cuenta lo que facturan los que van por delante", async () => {
            // Acumulado: 50, 85, 95, 100. P2 empieza en el 50 y termina pasado el 80.
            expect(await clasificar([50, 35, 10, 5])).toEqual(["A", "A", "B", "C"]);
        });

        it("el más vendido es A aunque facture más del 80 % él solo", async () => {
            expect(await clasificar([90, 6, 4])).toEqual(["A", "B", "C"]);
        });

        it("dos productos con la misma cifra comparten clase aunque la línea caiga entre ellos", async () => {
            // Sin tratar los empates, el segundo de los dos 20 empezaría en el 80 y sería B.
            expect(await clasificar([60, 20, 20])).toEqual(["A", "A", "A"]);
        });

        it("los productos sin ventas en el periodo son C, y siguen en el catálogo", async () => {
            expect(await clasificar([80, 0, 20, 0])).toEqual(["A", "C", "B", "C"]);
        });

        it("un producto inactivo con ventas también se clasifica", async () => {
            const p = await producto("Descatalogado");
            await venta(p.id, 100);
            await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });

            const res = await request(app).get(`${PRODUCTOS}/${p.id}`).set("Cookie", cookie);
            expect(res.body.data.abcClass).toBe("A");
        });
    });

    describe("qué ventas cuentan", () => {
        it("solo las enviadas dentro del periodo: ni pendientes, ni canceladas, ni las del mes en curso ni de antes", async () => {
            const [a, b] = [await producto("Cuenta"), await producto("No cuenta")];
            await venta(a.id, 10);
            await venta(b.id, 1000, { status: "PENDING" });
            await venta(b.id, 1000, { status: "CANCELLED" });
            // El primer instante local del mes en curso ya no es del periodo.
            const finDelPeriodo = new Date(medianocheLocal(periodo.to).getTime() + 24 * 60 * 60 * 1000);
            await venta(b.id, 1000, { shippedAt: finDelPeriodo });
            // Un minuto antes de que empiece el periodo, tampoco.
            await venta(b.id, 1000, { shippedAt: new Date(medianocheLocal(periodo.from).getTime() - 60_000) });

            await abcService.recalcular();
            const filas = await prisma.productAbc.findMany();
            expect(filas.map((f) => [f.productId, f.abcClass])).toEqual([[a.id, "A"]]);
        });

        it("el primer y el último instante del periodo, en hora del negocio, sí cuentan", async () => {
            const [a, b] = [await producto("Primero"), await producto("Último")];
            await venta(a.id, 50, { shippedAt: medianocheLocal(periodo.from) });
            await venta(b.id, 50, { shippedAt: new Date(medianocheLocal(periodo.to).getTime() + 24 * 60 * 60 * 1000 - 1) });

            await abcService.recalcular();
            expect(await prisma.productAbc.count()).toBe(2);
        });
    });

    describe("el filtro del catálogo", () => {
        it("cada clase devuelve sus productos, y C incluye los que no vendieron", async () => {
            const nombres = ["Estrella", "Medio", "Cola", "Sin ventas"];
            const ps = [];
            for (const n of nombres) ps.push(await producto(n));
            await venta(ps[0]!.id, 80);
            await venta(ps[1]!.id, 15);
            await venta(ps[2]!.id, 5);

            const filtrar = async (clase: string) => {
                const res = await request(app).get(`${PRODUCTOS}?abcClass=${clase}&limit=100`).set("Cookie", cookie);
                expect(res.status).toBe(200);
                return { nombres: res.body.data.data.map((p: { name: string }) => p.name).sort(), total: res.body.data.meta.total };
            };

            expect(await filtrar("A")).toEqual({ nombres: ["Estrella"], total: 1 });
            expect(await filtrar("B")).toEqual({ nombres: ["Medio"], total: 1 });
            expect(await filtrar("C")).toEqual({ nombres: ["Cola", "Sin ventas"], total: 2 });
        });

        it("una clase desconocida es un 400, no un filtro ignorado", async () => {
            const res = await request(app).get(`${PRODUCTOS}?abcClass=a`).set("Cookie", cookie);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INVALID_FILTER_VALUE");
        });
    });

    describe("la caché", () => {
        it("no se recalcula mientras está vigente, y sí pasado un día", async () => {
            const [a, b] = [await producto("Antes"), await producto("Después")];
            await venta(a.id, 100);
            const ahora = new Date();
            await abcService.asegurar(ahora);

            await venta(b.id, 1000);
            await abcService.asegurar(new Date(ahora.getTime() + 60_000));
            expect(await prisma.productAbc.count()).toBe(1);

            await abcService.asegurar(new Date(ahora.getTime() + VIGENCIA_ABC_MS + 1));
            const b2 = await prisma.productAbc.findUnique({ where: { productId: b.id } });
            expect(b2?.abcClass).toBe("A");
        });

        it("cambiar la zona del negocio la invalida", async () => {
            const a = await producto("Zona");
            await abcService.asegurar();
            expect(await prisma.productAbc.count()).toBe(0);

            await venta(a.id, 10);
            await prisma.appSetting.create({ data: { key: "timezone", value: "UTC" } });
            await abcService.asegurar();
            const calculo = await prisma.abcCalculation.findUniqueOrThrow({ where: { id: 1 } });
            expect(calculo.timezone).toBe("UTC");
            expect(await prisma.productAbc.count()).toBe(1);
        });

        it("el catálogo no espera al recálculo si ya hay una clasificación que servir", async () => {
            const ahora = new Date();
            await abcService.asegurar(ahora);

            // Un recálculo que no termina nunca: si `refrescar` lo esperase, el test caducaría.
            const espia = jest.spyOn(abcService, "recalcular").mockReturnValue(new Promise(() => undefined));
            try {
                await abcService.refrescar(new Date(ahora.getTime() + VIGENCIA_ABC_MS + 1));
                expect(espia).toHaveBeenCalledTimes(1);
            } finally {
                espia.mockRestore();
            }
        });

        it("sin ninguna clasificación todavía, sí la espera: si no, todo saldría C", async () => {
            const a = await producto("Primera vez");
            await venta(a.id, 10);

            await abcService.refrescar();
            expect(await prisma.productAbc.count()).toBe(1);
        });

        it("si otra petición ya está recalculando, no espera ni repite el trabajo", async () => {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(510010)`;
                // Otra conexión: con el bloqueo tomado aquí, `recalcular` se retira sin escribir.
                expect(await abcService.recalcular()).toBe(false);
            });
            expect(await abcService.recalcular()).toBe(true);
        });
    });

    describe("GET /reports/abc", () => {
        it("da el periodo y cuántos productos hay en cada clase, con C incluyendo los que no vendieron", async () => {
            const ps = [];
            for (const n of ["A1", "B1", "C1", "C2"]) ps.push(await producto(n));
            await venta(ps[0]!.id, 80);
            await venta(ps[1]!.id, 15);
            await venta(ps[2]!.id, 5);

            const res = await request(app).get(RESUMEN).set("Cookie", cookie);
            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({
                from: periodo.from,
                to: periodo.to,
                timezone: ZONA_HORARIA_POR_DEFECTO,
                counts: { A: 1, B: 1, C: 2 },
            });
        });

        it("exige sesión", async () => {
            const res = await request(app).get(RESUMEN);
            expect(res.status).toBe(401);
        });
    });
});
