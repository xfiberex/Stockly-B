import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * T4-15 — `GET /products/:id/movements`, paginado y filtrado en la base.
 *
 * Lo que hay que impedir que vuelva no es «que sea lento»: es que **el endpoint devuelva
 * el histórico entero**. Eso no falla, no da error y no se nota con los datos de
 * desarrollo —once movimientos por producto—; se nota con un producto de 100 000, y para
 * entonces se lleva por delante a las peticiones de todos los demás.
 *
 * Por eso la comprobación central es la primera: **sin parámetros no se devuelve todo**.
 * Un test que pidiese `?limit=5` y recibiese 5 pasaría igual con el defecto puesto.
 */

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const BASE = "/api/v1/products";

/** 120 movimientos: por encima del límite por defecto (50), y de dos tipos y dos días. */
const TOTAL = 120;

describe("Histórico de un producto, paginado (T4-15)", () => {
    let cookie: string;
    let productId: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "mov_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);

        const product = await prisma.product.create({
            data: { name: "Producto con histórico", price: 10, stock: 500, minStock: 5 },
        });
        productId = product.id;

        // `createdAt` se fija a mano: la mitad en enero y la mitad en marzo, y **todos los
        // de cada mitad comparten instante**. Es el caso que rompe una paginación sin
        // desempate, y es realista: una importación crea cientos de filas a la vez.
        await prisma.stockMovement.createMany({
            data: Array.from({ length: TOTAL }, (_, i) => ({
                productId,
                type: i % 2 === 0 ? ("IN" as const) : ("OUT" as const),
                delta: i % 2 === 0 ? 1 : -1,
                stockAfter: 500,
                note: `mov ${i}`,
                createdAt: new Date(i < TOTAL / 2 ? "2026-01-15T10:00:00.000Z" : "2026-03-20T10:00:00.000Z"),
            })),
        });
    });

    afterAll(async () => {
        await cleanDb();
    });

    const pedir = (query = "") =>
        request(app).get(`${BASE}/${productId}/movements${query}`).set("Cookie", cookie);

    it("sin parámetros NO devuelve el histórico entero", async () => {
        const res = await pedir();

        expect(res.status).toBe(200);
        expect(res.body.data.movements).toHaveLength(50);
        expect(res.body.data.meta).toEqual({ total: TOTAL, page: 1, limit: 50, totalPages: 3 });
    });

    it("la primera página es lo más reciente", async () => {
        const res = await pedir();

        // Los de marzo son la segunda mitad de los creados; con orden descendente tienen
        // que salir todos antes que los de enero.
        const fechas = res.body.data.movements.map((m: { createdAt: string }) => m.createdAt);
        expect(new Set(fechas).size).toBe(1);
        expect(fechas[0]).toContain("2026-03-20");
    });

    it("recorrer las páginas no repite ni pierde ningún movimiento", async () => {
        // La comprobación que justifica el desempate por `id`: sesenta filas comparten
        // `createdAt` al milisegundo, así que sin un orden total una misma fila puede
        // aparecer en dos páginas y otra en ninguna, y el recuento seguiría cuadrando.
        const vistos = new Set<string>();

        for (const page of [1, 2, 3]) {
            const res = await pedir(`?page=${page}`);
            for (const m of res.body.data.movements as Array<{ id: string }>) vistos.add(m.id);
        }

        expect(vistos.size).toBe(TOTAL);
    });

    it("una página fuera de rango es una lista vacía, no un error", async () => {
        const res = await pedir("?page=99");

        expect(res.status).toBe(200);
        expect(res.body.data.movements).toEqual([]);
        expect(res.body.data.meta.total).toBe(TOTAL);
    });

    it("el filtro de tipo se aplica en la base, y `meta.total` es el del filtro", async () => {
        // Si el filtro se quedara en el navegador, `total` seguiría diciendo 120 y la
        // paginación mostraría páginas vacías al final.
        const res = await pedir("?type=IN");

        expect(res.body.data.meta.total).toBe(TOTAL / 2);
        expect(res.body.data.movements.every((m: { type: string }) => m.type === "IN")).toBe(true);
    });

    it("un tipo que no existe se rechaza en vez de devolver una lista vacía", async () => {
        const res = await pedir("?type=SALIDA");

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_FILTER_VALUE");
    });

    it("`dateTo` incluye el día entero", async () => {
        // El error clásico: `lte: 2026-03-20T00:00:00` deja fuera los movimientos de ese
        // mismo día, y quien filtra «hasta el 20» cuenta con verlos.
        const res = await pedir("?dateFrom=2026-03-20&dateTo=2026-03-20");

        expect(res.body.data.meta.total).toBe(TOTAL / 2);
    });

    it("una fecha ilegible se rechaza en vez de ignorarse", async () => {
        const res = await pedir("?dateFrom=el-martes");

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_FILTER_VALUE");
    });

    it("los filtros se combinan", async () => {
        const res = await pedir("?type=IN&dateFrom=2026-03-01");

        expect(res.body.data.meta.total).toBe(TOTAL / 4);
    });

    it("el producto sigue viajando con la página", async () => {
        // La pantalla lo necesita para la cabecera y el stock mínimo; paginar los
        // movimientos no debía costarle una segunda petición.
        const res = await pedir("?page=2");

        expect(res.body.data.product.name).toBe("Producto con histórico");
    });

    it("404 si el producto no existe, antes de contar nada", async () => {
        const res = await request(app)
            .get(`${BASE}/00000000-0000-4000-8000-000000000000/movements`)
            .set("Cookie", cookie);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("la exportación sigue trayendo el histórico completo, no una página", async () => {
        // **La ficha daba esto por resuelto y no lo estaba**: la exportación cargaba los
        // movimientos de golpe y construía el CSV entero en una cadena. Ahora va por lotes
        // de 500, y lo que no puede cambiar es el resultado: el archivo lleva las 120
        // filas, no las 50 de la primera página.
        const res = await request(app)
            .get(`${BASE}/${productId}/movements/export?format=csv`)
            .set("Cookie", cookie);

        expect(res.status).toBe(200);
        const lineas = res.text.trim().split("\n");
        expect(lineas).toHaveLength(TOTAL + 1); // + cabecera
        expect(lineas[0]).toContain("productName");
    });

    it("la exportación acepta los mismos filtros que el listado", async () => {
        // El tope de exportación rechaza con 413 diciendo «filtra antes de exportar». Sin
        // filtros aquí ese consejo no se podía seguir, y un producto con más movimientos que
        // el tope no había forma de exportarlo — medido con el producto caliente de la prueba
        // de carga: 100 019 contra un máximo de 100 000.
        const res = await request(app)
            .get(`${BASE}/${productId}/movements/export?format=csv&type=IN`)
            .set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.text.trim().split("\n")).toHaveLength(TOTAL / 2 + 1);
    });

    it("un filtro inválido en la exportación se rechaza igual que en el listado", async () => {
        const res = await request(app)
            .get(`${BASE}/${productId}/movements/export?format=csv&type=SALIDA`)
            .set("Cookie", cookie);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_FILTER_VALUE");
    });
});
