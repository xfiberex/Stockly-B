import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * T4-16 — las consultas del dashboard.
 *
 * **Lo que esta tarea cambió no se ve en el comportamiento.** Las dos reescrituras devuelven
 * exactamente lo mismo que antes: lo que cambia es el plan que elige PostgreSQL, y eso no lo
 * puede afirmar un test de integración sobre 20 filas de prueba —con esos datos cualquier
 * plan es instantáneo y ninguno se va a disco—. Las mediciones que justifican el cambio
 * están en `docs/rendimiento.md`, hechas sobre 100 000 productos.
 *
 * Lo que sí se puede fijar aquí, y es lo que se rompería al «simplificar» la SQL de vuelta:
 *
 *  - que la rotación sigue devolviendo **los mismos productos y totales**, incluida la
 *    exclusión de los inactivos, que es la parte que la reescritura mueve de sitio;
 *  - que el **orden es estable ante empates**, que era una fuente de barajado entre recargas;
 *  - que si el margen rápido no llega a 20 filas, la vuelta atrás exacta las completa.
 */

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/reports";

/** Un producto con `salidas` unidades de OUT en los últimos 30 días. */
async function productoConSalidas(nombre: string, salidas: number, isActive = true) {
    const p = await prisma.product.create({ data: { name: nombre, price: 10, stock: 100, minStock: 5, isActive } });
    if (salidas > 0) {
        await prisma.stockMovement.create({
            data: { productId: p.id, type: "OUT", delta: -salidas, stockAfter: 100, createdAt: new Date() },
        });
    }
    return p;
}

describe("Consultas del dashboard (T4-16)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "dash@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    const resumen = () => request(app).get(BASE).set("Cookie", cookie);

    it("la rotación ordena por unidades salidas, de más a menos", async () => {
        await productoConSalidas("Poca rotación", 5);
        await productoConSalidas("Mucha rotación", 500);
        await productoConSalidas("Rotación media", 50);

        const res = await resumen();

        expect(res.status).toBe(200);
        const nombres = res.body.data.stockMetrics.map((m: { productName: string }) => m.productName);
        expect(nombres).toEqual(["Mucha rotación", "Rotación media", "Poca rotación"]);
        expect(res.body.data.stockMetrics[0].totalOutLast30Days).toBe(500);
    });

    it("un producto inactivo no entra en la rotación aunque sea el que más sale", async () => {
        // Es la parte que la reescritura mueve de sitio: antes el filtro estaba en el
        // `WHERE` de `products`; ahora se aplica **después** de agregar los movimientos.
        await productoConSalidas("Descatalogado con salidas", 9999, false);

        const res = await resumen();

        const nombres = res.body.data.stockMetrics.map((m: { productName: string }) => m.productName);
        expect(nombres).not.toContain("Descatalogado con salidas");
        expect(nombres[0]).toBe("Mucha rotación");
    });

    it("un producto sin salidas en 30 días no ocupa sitio en la tabla", async () => {
        // El `LEFT JOIN` de antes los traía con `totalOut = 0` y llenaban las veinte filas
        // con productos que no rotan: días hasta agotarse `null` y nada que decidir.
        await productoConSalidas("Sin movimiento", 0);

        const res = await resumen();

        const nombres = res.body.data.stockMetrics.map((m: { productName: string }) => m.productName);
        expect(nombres).not.toContain("Sin movimiento");
    });

    it("con empates el orden es el mismo en dos peticiones seguidas", async () => {
        // Seis productos empataban en el valor de corte del conjunto de carga. Sin desempate
        // por `id`, cuáles entran en el top 20 cambia entre recargas de la misma pantalla.
        await Promise.all(["Empate A", "Empate B", "Empate C"].map((n) => productoConSalidas(n, 50)));

        const [uno, dos] = await Promise.all([resumen(), resumen()]);

        const ids = (r: { body: { data: { stockMetrics: Array<{ productId: string }> } } }) =>
            r.body.data.stockMetrics.map((m) => m.productId);
        expect(ids(uno)).toEqual(ids(dos));
    });

    it("con más de veinte productos rotando, devuelve veinte y los mejores", async () => {
        // **Este test existe porque los de arriba no valían para esto.** Con cuatro productos
        // la consulta rápida devuelve menos de 20 filas y `getSummary` cae siempre en la
        // variante exacta: sin este caso, el camino rápido —el que se ejecuta de verdad en
        // producción— no lo recorría ningún test.
        await Promise.all(
            Array.from({ length: 25 }, (_, i) => productoConSalidas(`Rotador ${String(i).padStart(2, "0")}`, 1000 + i)),
        );

        const res = await resumen();

        expect(res.body.data.stockMetrics).toHaveLength(20);
        // Los 25 nuevos salen todos por encima de los de antes (1000+), y el mejor es el 24.
        expect(res.body.data.stockMetrics[0].productName).toBe("Rotador 24");
        expect(res.body.data.stockMetrics[0].totalOutLast30Days).toBe(1024);
        expect(res.body.data.stockMetrics.at(-1).totalOutLast30Days).toBe(1005);
    });

    it("los movimientos por mes siguen agrupados por mes y tipo", async () => {
        // La otra reescritura: seis recorridos por rango en vez de una ordenación completa.
        // Lo que no puede cambiar es la forma de la respuesta.
        const res = await resumen();

        expect(Array.isArray(res.body.data.movementsByMonth)).toBe(true);
        for (const fila of res.body.data.movementsByMonth) {
            expect(fila.month).toMatch(/^\d{4}-\d{2}$/);
            expect(["IN", "OUT", "ADJUSTMENT", "IMPORT"]).toContain(fila.type);
            expect(typeof fila.total).toBe("number");
        }
        // Los OUT que ha creado esta suite tienen que estar contados en el mes en curso.
        const mesActual = new Date().toISOString().slice(0, 7);
        const salidas = res.body.data.movementsByMonth.find(
            (f: { month: string; type: string }) => f.month === mesActual && f.type === "OUT",
        );
        expect(salidas?.total).toBeGreaterThan(0);
    });

    it("un movimiento fuera de la ventana de 6 meses no aparece", async () => {
        const viejo = await prisma.product.create({ data: { name: "Antiguo", price: 1, stock: 1 } });
        await prisma.stockMovement.create({
            data: {
                productId: viejo.id,
                type: "IN",
                delta: 7,
                stockAfter: 1,
                createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
            },
        });

        const res = await resumen();

        const meses = res.body.data.movementsByMonth.map((f: { month: string }) => f.month);
        expect(meses).not.toContain(new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7));
    });
});
