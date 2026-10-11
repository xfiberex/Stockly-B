import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import {
    avisoSchema,
    codigoDeLotePorDefecto,
    esDiaValido,
    informeDeCaducidadesSchema,
    lotesDeProductoSchema,
    movimientosDeProductoSchema,
    ordenVentaSchema,
    productoConDisponibleSchema,
    transferenciaConLineasSchema,
    type InformeDeCaducidades,
    type LotesDeProducto,
} from "@/contratos/api";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";
import { hoyEn, ZONA_HORARIA_POR_DEFECTO } from "@/shared/lib/zonaHoraria";
import { diasHasta, hoyDelNegocio } from "@/shared/lib/lotes";
import { notificationsService } from "@/modules/notifications/notifications.service";
import { lotesDeLaLinea } from "@/modules/sale-orders/sale-orders.comprobante";
import { lineasDe } from "@/modules/stock-transfers/stock-transfers.lineas";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const API = "/api/v1";

/** Hoy en la zona del negocio —la de por defecto: `cleanDb` borra los ajustes—, y hoy más `n` días. */
const HOY = hoyEn(ZONA_HORARIA_POR_DEFECTO);
const dia = (n: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * T5-15 — lotes y fechas de caducidad.
 *
 * Lo que se vigila: que una venta saque **primero lo que caduca antes** y nunca lo caducado; que
 * lo que entra de un producto que lleva lotes entre siempre en uno, con su fecha; que cada
 * unidad que se devuelve vuelva **a su lote**; y que el informe de caducidades diga lo que hay,
 * dónde y cuánto vale. Y, debajo de todo, lo de T5-14: el total sigue siendo la suma de los
 * niveles, ahora que cada nivel son varias filas.
 */
describe("Lotes y fechas de caducidad (T5-15)", () => {
    let admin: string;
    let almacenero: string;
    let vendedor: string;
    let norte: string;

    const como = (cookie: () => string) => ({
        get: (ruta: string) => request(app).get(`${API}${ruta}`).set("Cookie", cookie()),
        post: (ruta: string, cuerpo?: object) => request(app).post(`${API}${ruta}`).set("Cookie", cookie()).send(cuerpo),
        put: (ruta: string, cuerpo?: object) => request(app).put(`${API}${ruta}`).set("Cookie", cookie()).send(cuerpo),
        patch: (ruta: string, cuerpo?: object) => request(app).patch(`${API}${ruta}`).set("Cookie", cookie()).send(cuerpo),
    });
    const comoAdmin = como(() => admin);
    const comoAlmacen = como(() => almacenero);

    /** Un producto que lleva lotes, sin stock: el stock se le pone recibiendo o con `ponerLote`. */
    const conLotes = (name: string, extra: { costPrice?: number; minStock?: number } = {}) =>
        crearProducto({ data: { name, price: 20, tracksLots: true, ...extra } });

    /**
     * Un lote con `stock` unidades en un almacén, **directamente en la base**: es la única forma
     * de tener uno ya caducado, porque la API no deja dar entrada a mercancía vencida.
     */
    async function ponerLote(productId: string, code: string, expiresAt: string, stock: number, warehouseId = ALMACEN) {
        return prisma.$transaction(async (tx) => {
            const lote = await tx.lot.upsert({
                where: { productId_code: { productId, code } },
                update: {},
                create: { productId, code, expiresAt: new Date(`${expiresAt}T00:00:00Z`) },
            });
            await tx.stockLevel.create({ data: { productId, warehouseId, lotId: lote.id, stock } });
            await tx.product.update({ where: { id: productId }, data: { stock: { increment: stock } } });
            return lote;
        });
    }

    const total = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
    const suma = async (where: object) => (await prisma.stockLevel.aggregate({ where, _sum: { stock: true } }))._sum.stock ?? 0;
    const enLote = (lotId: string, warehouseId = ALMACEN) => suma({ lotId, warehouseId });
    const sinLote = (productId: string, warehouseId = ALMACEN) => suma({ productId, warehouseId, lotId: null });
    const loteDe = (productId: string, code: string) => prisma.lot.findUniqueOrThrow({ where: { productId_code: { productId, code } } });
    const movimientos = (productId: string, where: object = {}) =>
        prisma.stockMovement.findMany({ where: { productId, ...where }, include: { lot: true }, orderBy: [{ createdAt: "asc" }, { stockAfter: "desc" }] });

    type Producto = { id: string; name: string };
    const linea = (p: Producto, quantity: number) => ({ productId: p.id, productName: p.name, quantity, unitPrice: 20 });
    const vender = (p: Producto, quantity: number, extra: object = {}) => comoAdmin.post("/sale-orders", { items: [linea(p, quantity)], ...extra });
    const enviar = (id: string) => comoAlmacen.post(`/sale-orders/${id}/ship`);

    async function comprar(p: Producto, quantity: number) {
        const res = await comoAdmin.post("/purchase-orders", { items: [{ productId: p.id, productName: p.name, quantity, unitPrice: 4 }] });
        expect(res.status).toBe(201);
        return res.body.data as { id: string; items: Array<{ id: string }> };
    }
    const recibir = (orden: { id: string }, items: object[]) => comoAlmacen.post(`/purchase-orders/${orden.id}/receipts`, { items });
    /** Compra y recibe entera, en un lote. */
    async function recibirLote(p: Producto, quantity: number, expiresAt: string, lotCode?: string) {
        const orden = await comprar(p, quantity);
        const res = await recibir(orden, [{ itemId: orden.items[0]!.id, quantity, expiresAt, ...(lotCode && { lotCode }) }]);
        expect(res.status).toBe(201);
        return orden;
    }
    const mover = (p: Producto, cuerpo: object) => comoAlmacen.post(`/products/${p.id}/movements`, { reason: "Prueba", ...cuerpo });

    /** La suma de los niveles de cada producto es su total: lo que la base garantiza, comprobado. */
    async function todoCuadra() {
        const descuadrados = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT p.id FROM products p
            LEFT JOIN (SELECT "productId", SUM(stock) AS suma FROM stock_levels GROUP BY 1) l ON l."productId" = p.id
            WHERE p.stock <> COALESCE(l.suma, 0)`;
        expect(descuadrados).toEqual([]);
    }

    beforeEach(async () => {
        await cleanDb();
        // Los avisos caen con sus usuarios; el mantenimiento, que no sea «hace poco».
        notificationsService.olvidarMantenimiento();
        admin = getAuthCookie((await createUser({ email: "lotes_admin@example.com", role: "ADMIN" })).id);
        almacenero = getAuthCookie((await createUser({ email: "lotes_almacen@example.com", role: "WAREHOUSE" })).id);
        vendedor = getAuthCookie((await createUser({ email: "lotes_vendedor@example.com", role: "SELLER" })).id);
        norte = (await prisma.warehouse.create({ data: { name: "Sucursal Norte" } })).id;
    });

    afterEach(async () => {
        await esperarAlertasEnVuelo();
        await todoCuadra();
    });

    afterAll(async () => {
        await cleanDb();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: enviar una venta consume primero el lote que caduca antes", () => {
        it("aunque ese lote se recibiera después, y anota de cuáles salió", async () => {
            const p = await conLotes("Yogur");
            // El que caduca más tarde entra **primero**: el orden de salida no es el de llegada.
            await recibirLote(p, 5, dia(60), "TARDE");
            await recibirLote(p, 5, dia(10), "PRONTO");
            const pronto = await loteDe(p.id, "PRONTO");
            const tarde = await loteDe(p.id, "TARDE");

            const { body } = await vender(p, 7);
            // Pendiente todavía: no ha salido nada, así que no hay lotes que decir.
            expect(body.data.items[0].lots).toEqual([]);

            const res = await enviar(body.data.id);

            expect(res.status).toBe(200);
            expect(() => ordenVentaSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data.items[0].lots).toEqual([
                { id: pronto.id, code: "PRONTO", expiresAt: dia(10), quantity: 5 },
                { id: tarde.id, code: "TARDE", expiresAt: dia(60), quantity: 2 },
            ]);
            expect(await enLote(pronto.id)).toBe(0);
            expect(await enLote(tarde.id)).toBe(3);
            expect(await total(p.id)).toBe(3);

            // Un movimiento por lote tocado, cada uno con lo que quedaba después de él.
            const salidas = await movimientos(p.id, { type: "OUT" });
            expect(salidas.map((m) => ({ lote: m.lot?.code, delta: m.delta, stockAfter: m.stockAfter, enAlmacen: m.warehouseStockAfter }))).toEqual([
                { lote: "PRONTO", delta: -5, stockAfter: 5, enAlmacen: 5 },
                { lote: "TARDE", delta: -2, stockAfter: 3, enAlmacen: 3 },
            ]);
        });

        it("un lote agotado no deja fila en el almacén, y lo que queda del otro sigue en su sitio", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 2, dia(5), "A");
            await recibirLote(p, 2, dia(9), "B");

            await enviar((await vender(p, 2)).body.data.id);

            expect(await prisma.stockLevel.count({ where: { productId: p.id } })).toBe(1);
            expect(await enLote((await loteDe(p.id, "B")).id)).toBe(2);
        });

        it("a igual fecha, por código: el reparto no depende de cómo devuelva las filas la base", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 3, dia(10), "B");
            await recibirLote(p, 3, dia(10), "A");

            const res = await enviar((await vender(p, 4)).body.data.id);

            expect(res.body.data.items[0].lots.map((l: { code: string; quantity: number }) => [l.code, l.quantity])).toEqual([["A", 3], ["B", 1]]);
        });

        it("la venta de mostrador sigue el mismo orden", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 4, dia(30), "TARDE");
            await recibirLote(p, 4, dia(3), "PRONTO");

            const res = await request(app).post(`${API}/sale-orders/counter`).set("Cookie", vendedor).send({ items: [{ productId: p.id, quantity: 5 }] });

            expect(res.status).toBe(201);
            expect(res.body.data.items[0].lots.map((l: { code: string; quantity: number }) => [l.code, l.quantity])).toEqual([["PRONTO", 4], ["TARDE", 1]]);
        });

        it("lo que no tiene lote sale antes que cualquier lote, y no se anota como de ninguno", async () => {
            // Tenía stock antes de llevar lotes: esas unidades son las más antiguas.
            const p = await crearProducto({ data: { name: "Queso", price: 20, stock: 5 } });
            expect((await comoAdmin.put(`/products/${p.id}`, { tracksLots: true })).status).toBe(200);
            await recibirLote(p, 5, dia(20), "NUEVO");

            const res = await enviar((await vender(p, 6)).body.data.id);

            expect(res.body.data.items[0].lots).toEqual([{ id: (await loteDe(p.id, "NUEVO")).id, code: "NUEVO", expiresAt: dia(20), quantity: 1 }]);
            expect(await sinLote(p.id)).toBe(0);
            expect(await enLote((await loteDe(p.id, "NUEVO")).id)).toBe(4);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: un lote caducado no se asigna a una venta", () => {
        it("lo caducado sigue en el stock pero no en el disponible, y no se puede vender", async () => {
            const p = await conLotes("Leche");
            const caducado = await ponerLote(p.id, "VIEJO", dia(-1), 10);
            await ponerLote(p.id, "BUENO", dia(15), 4);

            const ficha = (await comoAdmin.get(`/products/${p.id}`)).body.data;
            expect(() => productoConDisponibleSchema.parse(ficha)).not.toThrow();
            expect(ficha).toMatchObject({ stock: 14, expiredStock: 10, committedStock: 0, availableStock: 4 });
            expect(ficha.stockLevels).toEqual([{ warehouseId: ALMACEN, stock: 14, expiredStock: 10, committedStock: 0, availableStock: 4 }]);

            // Cinco no caben en los cuatro que se pueden vender, aunque haya catorce.
            const rechazada = await vender(p, 5);
            expect(rechazada.status).toBe(409);
            expect(rechazada.body).toMatchObject({ code: "INSUFFICIENT_AVAILABLE_STOCK", params: { disponible: 4, requerido: 5 } });
            const enMostrador = await request(app).post(`${API}/sale-orders/counter`).set("Cookie", vendedor).send({ items: [{ productId: p.id, quantity: 5 }] });
            expect(enMostrador.status).toBe(409);

            // Cuatro sí, y salen del bueno: el caducado no se toca.
            const res = await enviar((await vender(p, 4)).body.data.id);
            expect(res.status).toBe(200);
            expect(res.body.data.items[0].lots.map((l: { code: string }) => l.code)).toEqual(["BUENO"]);
            expect(await enLote(caducado.id)).toBe(10);
            expect(await total(p.id)).toBe(10);
        });

        it("si el lote caduca entre crear la venta y enviarla, el envío falla y no sale nada", async () => {
            const p = await conLotes("Leche");
            const lote = await ponerLote(p.id, "JUSTO", dia(2), 6);
            const { body } = await vender(p, 6);

            // Pasan los días con la venta sin enviar.
            await prisma.lot.update({ where: { id: lote.id }, data: { expiresAt: new Date(`${dia(-1)}T00:00:00Z`) } });
            const res = await enviar(body.data.id);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { disponible: 0, requerido: 6 } });
            expect(await enLote(lote.id)).toBe(6);
            expect(await prisma.saleOrderItemLot.count()).toBe(0);
        });

        it("el lote que caduca hoy todavía se vende: caduca al terminar el día", async () => {
            const p = await conLotes("Leche");
            await ponerLote(p.id, "HOY", dia(0), 3);

            expect((await comoAdmin.get(`/products/${p.id}`)).body.data).toMatchObject({ expiredStock: 0, availableStock: 3 });
            expect((await enviar((await vender(p, 3)).body.data.id)).status).toBe(200);
        });

        it("«hoy» es el día del negocio, no el de UTC", async () => {
            // A las 02:00 UTC del día 6 en Santo Domingo siguen siendo las 22:00 del día 5.
            expect(await hoyDelNegocio(new Date("2026-03-06T02:00:00Z"))).toBe("2026-03-05");
            expect(diasHasta("2026-03-05", "2026-03-05")).toBe(0);
            expect(diasHasta("2026-03-04", "2026-03-05")).toBe(-1);
            expect(diasHasta("2026-04-05", "2026-03-05")).toBe(31);
        });

        it("tampoco se transfiere: lo caducado se da de baja donde está", async () => {
            const p = await conLotes("Leche");
            const caducado = await ponerLote(p.id, "VIEJO", dia(-3), 5);
            await ponerLote(p.id, "BUENO", dia(15), 2);

            const cuerpo = (quantity: number) => ({ fromWarehouseId: ALMACEN, toWarehouseId: norte, items: [{ productId: p.id, quantity }] });
            const demasiado = await comoAlmacen.post("/stock-transfers", cuerpo(3));
            expect(demasiado.status).toBe(409);
            expect(demasiado.body).toMatchObject({ code: "INSUFFICIENT_AVAILABLE_STOCK", params: { disponible: 2, requerido: 3 } });

            expect((await comoAlmacen.post("/stock-transfers", cuerpo(2))).status).toBe(201);
            expect(await enLote(caducado.id)).toBe(5);
            expect(await enLote(caducado.id, norte)).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: el informe de caducidades", () => {
        const informe = async (query = "") => (await comoAdmin.get(`/reports/expiring${query}`)).body.data as InformeDeCaducidades;

        it("lista lo que vence en los próximos N días, y lo ya caducado, con su valor a coste", async () => {
            const p = await conLotes("Jamón", { costPrice: 2.5 });
            await ponerLote(p.id, "CADUCADO", dia(-3), 2);
            await ponerLote(p.id, "PRONTO", dia(5), 4);
            await ponerLote(p.id, "LEJOS", dia(40), 6);

            const res = await comoAdmin.get("/reports/expiring?days=30");

            expect(res.status).toBe(200);
            expect(() => informeDeCaducidadesSchema.parse(res.body.data)).not.toThrow();
            const datos = res.body.data as InformeDeCaducidades;
            expect(datos).toMatchObject({ today: HOY, days: 30, meta: { total: 2 } });
            expect(datos.data.map((f) => ({ code: f.code, expiresAt: f.expiresAt, daysLeft: f.daysLeft, expired: f.expired, stock: f.stock, costValue: f.costValue }))).toEqual([
                { code: "CADUCADO", expiresAt: dia(-3), daysLeft: -3, expired: true, stock: 2, costValue: 5 },
                { code: "PRONTO", expiresAt: dia(5), daysLeft: 5, expired: false, stock: 4, costValue: 10 },
            ]);
            expect(datos.data[0]).toMatchObject({ productId: p.id, productName: "Jamón", warehouseId: ALMACEN, warehouseName: "Principal", unitCost: 2.5 });
            expect(datos.summary).toEqual({ expiredUnits: 2, expiredCostValue: 5, expiringUnits: 4, expiringCostValue: 10, unitsWithoutCost: 0 });

            // Con un plazo más largo entra el tercero.
            expect((await informe("?days=40")).data.map((f) => f.code)).toEqual(["CADUCADO", "PRONTO", "LEJOS"]);
        });

        it("el plazo incluye sus dos extremos: lo que vence hoy y lo que vence el último día", async () => {
            const p = await conLotes("Jamón");
            await ponerLote(p.id, "HOY", dia(0), 1);
            await ponerLote(p.id, "ULTIMO", dia(7), 1);
            await ponerLote(p.id, "FUERA", dia(8), 1);

            const datos = await informe("?days=7");
            expect(datos.data.map((f) => [f.code, f.daysLeft, f.expired])).toEqual([["HOY", 0, false], ["ULTIMO", 7, false]]);
            // Y en el resumen igual: lo que vence hoy todavía no es «ya caducado».
            expect(datos.summary).toMatchObject({ expiredUnits: 0, expiringUnits: 2 });
            expect((await informe("?days=0")).data.map((f) => f.code)).toEqual(["HOY"]);
        });

        it("sin `days` usa el plazo de Configuración, 30 si nadie lo ha cambiado", async () => {
            const p = await conLotes("Jamón");
            await ponerLote(p.id, "A", dia(20), 1);

            expect(await informe()).toMatchObject({ days: 30, meta: { total: 1 } });

            expect((await comoAdmin.patch("/settings", { expiryWarningDays: 10 })).status).toBe(200);
            expect(await informe()).toMatchObject({ days: 10, meta: { total: 0 } });
        });

        it("una fila por lote y almacén, y se puede pedir un solo almacén", async () => {
            const p = await conLotes("Jamón", { costPrice: 1 });
            await ponerLote(p.id, "A", dia(5), 3);
            await ponerLote(p.id, "A", dia(5), 7, norte);

            expect((await informe()).data.map((f) => [f.warehouseName, f.stock])).toEqual([["Principal", 3], ["Sucursal Norte", 7]]);
            const soloNorte = await informe(`?warehouseId=${norte}`);
            expect(soloNorte.data.map((f) => f.stock)).toEqual([7]);
            expect(soloNorte.summary.expiringUnits).toBe(7);
            expect((await comoAdmin.get("/reports/expiring?warehouseId=11111111-1111-4111-8111-111111111111")).status).toBe(404);
        });

        it("los totales son de todo lo que cumple el filtro, no de la página", async () => {
            const p = await conLotes("Jamón", { costPrice: 2 });
            await ponerLote(p.id, "A", dia(1), 1);
            await ponerLote(p.id, "B", dia(2), 2);
            await ponerLote(p.id, "C", dia(3), 3);

            const pagina = await informe("?limit=2&page=2");
            expect(pagina.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
            expect(pagina.data.map((f) => f.code)).toEqual(["C"]);
            expect(pagina.summary).toMatchObject({ expiringUnits: 6, expiringCostValue: 12 });
        });

        it("un producto sin coste no suma cero en silencio: sus unidades se cuentan aparte", async () => {
            const conCoste = await conLotes("Jamón", { costPrice: 3 });
            const sinCoste = await conLotes("Pavo");
            await ponerLote(conCoste.id, "A", dia(2), 2);
            await ponerLote(sinCoste.id, "B", dia(2), 5);

            const datos = await informe();
            expect(datos.summary).toEqual({ expiredUnits: 0, expiredCostValue: 0, expiringUnits: 7, expiringCostValue: 6, unitsWithoutCost: 5 });
            expect(datos.data.find((f) => f.code === "B")).toMatchObject({ unitCost: null, costValue: null });
        });

        it("un lote agotado ya no aparece, ni lo que no tiene lote", async () => {
            const p = await crearProducto({ data: { name: "Jamón", price: 20, stock: 4, tracksLots: true } });
            await ponerLote(p.id, "A", dia(2), 2);
            await enviar((await vender(p, 6)).body.data.id);

            expect((await informe()).meta.total).toBe(0);
        });

        it("un `days` que no es un entero entre 0 y 730 se rechaza, no se ignora", async () => {
            for (const malo of ["abc", "-1", "1.5", "731"]) {
                const res = await comoAdmin.get(`/reports/expiring?days=${malo}`);
                expect([malo, res.status, res.body.code]).toEqual([malo, 400, "INVALID_FILTER_VALUE"]);
            }
        });

        it("lo lee cualquier rol; sin sesión, 401", async () => {
            expect((await request(app).get(`${API}/reports/expiring`).set("Cookie", vendedor)).status).toBe(200);
            expect((await request(app).get(`${API}/reports/expiring`)).status).toBe(401);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que entra de un producto que lleva lotes entra en un lote", () => {
        it("una recepción sin fecha de caducidad se rechaza entera: tampoco entran las otras líneas", async () => {
            const yogur = await conLotes("Yogur");
            const tornillo = await crearProducto({ data: { name: "Tornillo", price: 1 } });
            const res = await comoAdmin.post("/purchase-orders", {
                items: [
                    { productId: tornillo.id, productName: "Tornillo", quantity: 10, unitPrice: 1 },
                    { productId: yogur.id, productName: "Yogur", quantity: 5, unitPrice: 2 },
                ],
            });
            const orden = res.body.data as { id: string; items: Array<{ id: string; productId: string }> };
            const itemDe = (p: Producto) => orden.items.find((i) => i.productId === p.id)!.id;

            const rechazada = await recibir(orden, [{ itemId: itemDe(tornillo), quantity: 10 }, { itemId: itemDe(yogur), quantity: 5 }]);

            expect(rechazada.status).toBe(400);
            expect(rechazada.body).toMatchObject({ code: "LOT_EXPIRY_REQUIRED", params: { producto: "Yogur" } });
            expect(await total(tornillo.id)).toBe(0);
            expect(await total(yogur.id)).toBe(0);
            expect(await prisma.stockMovement.count()).toBe(0);

            // Con la fecha, entran las dos: la del producto sin lotes, sin lote.
            const aceptada = await recibir(orden, [{ itemId: itemDe(tornillo), quantity: 10 }, { itemId: itemDe(yogur), quantity: 5, expiresAt: dia(30) }]);
            expect(aceptada.status).toBe(201);
            expect(await sinLote(tornillo.id)).toBe(10);
            expect(await sinLote(yogur.id)).toBe(0);
            expect(await total(yogur.id)).toBe(5);
        });

        it("sin código, el lote se llama por su fecha, y dos entradas con la misma fecha son el mismo lote", async () => {
            const p = await conLotes("Yogur");
            const fecha = dia(30);

            await recibirLote(p, 5, fecha);
            await recibirLote(p, 3, fecha);

            const lotes = await prisma.lot.findMany({ where: { productId: p.id } });
            expect(lotes).toHaveLength(1);
            expect(lotes[0]!.code).toBe(`L-${fecha.replaceAll("-", "")}`);
            expect(lotes[0]!.code).toBe(codigoDeLotePorDefecto(fecha));
            expect(await enLote(lotes[0]!.id)).toBe(8);
            // El movimiento de la entrada dice su lote y su línea de compra.
            const entradas = await movimientos(p.id, { type: "IN" });
            expect(entradas.map((m) => [m.lot?.code, m.delta, m.purchaseOrderItemId !== null])).toEqual([[lotes[0]!.code, 5, true], [lotes[0]!.code, 3, true]]);
        });

        it("el mismo código con otra fecha se rechaza: un lote no caduca dos días distintos", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 5, dia(30), "L-77");

            const orden = await comprar(p, 2);
            const res = await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 2, expiresAt: dia(31), lotCode: "L-77" }]);

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "LOT_EXPIRY_MISMATCH", params: { producto: "Yogur", lote: "L-77", caducidad: dia(30) } });
            expect(await total(p.id)).toBe(5);
            // El mismo código en **otro producto** es otro lote: no chocan.
            const otro = await conLotes("Kéfir");
            await recibirLote(otro, 1, dia(31), "L-77");
            expect(await prisma.lot.count({ where: { code: "L-77" } })).toBe(2);
        });

        it("no entra mercancía ya caducada; la que caduca hoy, sí", async () => {
            const p = await conLotes("Yogur");
            const orden = await comprar(p, 4);

            const ayer = await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 2, expiresAt: dia(-1) }]);
            expect(ayer.status).toBe(400);
            expect(ayer.body).toMatchObject({ code: "LOT_ALREADY_EXPIRED", params: { producto: "Yogur", caducidad: dia(-1) } });
            expect(await prisma.lot.count()).toBe(0);

            expect((await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 2, expiresAt: dia(0) }])).status).toBe(201);
        });

        it("un lote para un producto que no los lleva se rechaza en vez de guardarse donde nadie lo vería", async () => {
            const p = await crearProducto({ data: { name: "Tornillo", price: 1 } });
            const orden = await comprar(p, 4);

            const res = await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 4, expiresAt: dia(30) }]);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: "PRODUCT_WITHOUT_LOTS", params: { producto: "Tornillo" } });
            expect(await total(p.id)).toBe(0);
        });

        it("una fecha que no existe o mal escrita es un 422", async () => {
            const p = await conLotes("Yogur");
            const orden = await comprar(p, 4);

            for (const mala of ["2099-02-30", "30/12/2099", "2099-1-5", ""]) {
                const res = await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 1, expiresAt: mala }]);
                expect([mala, res.status]).toEqual([mala, 422]);
            }
            expect(esDiaValido("2099-02-28")).toBe(true);
            expect(esDiaValido("2099-02-30")).toBe(false);
            expect(esDiaValido(20990228)).toBe(false);
        });

        it("marcar la orden como recibida pide el lote de cada línea que lo lleve", async () => {
            const p = await conLotes("Yogur");
            const orden = await comprar(p, 6);

            const sinLotes = await comoAdmin.patch(`/purchase-orders/${orden.id}`, { status: "RECEIVED" });
            expect(sinLotes.status).toBe(400);
            expect(sinLotes.body.code).toBe("LOT_EXPIRY_REQUIRED");

            const ajena = await comoAdmin.patch(`/purchase-orders/${orden.id}`, {
                status: "RECEIVED",
                lots: [{ itemId: "11111111-1111-4111-8111-111111111111", expiresAt: dia(9) }],
            });
            expect(ajena.status).toBe(404);
            expect(ajena.body.code).toBe("PURCHASE_ORDER_ITEM_NOT_FOUND");

            const res = await comoAdmin.patch(`/purchase-orders/${orden.id}`, {
                status: "RECEIVED",
                lots: [{ itemId: orden.items[0]!.id, expiresAt: dia(9), lotCode: "R-1" }],
            });
            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("RECEIVED");
            expect(await enLote((await loteDe(p.id, "R-1")).id)).toBe(6);
        });

        it("dos entradas simultáneas del mismo lote nuevo crean un solo lote y suman las dos", async () => {
            const p = await conLotes("Yogur");
            const ordenes = await Promise.all([comprar(p, 3), comprar(p, 4), comprar(p, 5)]);

            const respuestas = await Promise.all(
                ordenes.map((orden, i) => recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 3 + i, expiresAt: dia(12), lotCode: "JUNTOS" }])),
            );

            expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201]);
            expect(await prisma.lot.count({ where: { productId: p.id } })).toBe(1);
            expect(await enLote((await loteDe(p.id, "JUNTOS")).id)).toBe(12);
            expect(await total(p.id)).toBe(12);
        });

        it("un producto nace con lotes y con stock solo si se dice cuándo caduca ese stock", async () => {
            const sinFecha = await comoAdmin.post("/products", { name: "Yogur", price: 3, stock: 6, tracksLots: true });
            expect(sinFecha.status).toBe(400);
            expect(sinFecha.body.code).toBe("LOT_EXPIRY_REQUIRED");
            expect(await prisma.product.count()).toBe(0);

            const res = await comoAdmin.post("/products", { name: "Yogur", price: 3, stock: 6, tracksLots: "true", lotExpiresAt: dia(20), lotCode: "INICIAL" });
            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ tracksLots: true, stock: 6 });
            const lote = await loteDe(res.body.data.id, "INICIAL");
            expect(await enLote(lote.id)).toBe(6);
            expect((await movimientos(res.body.data.id)).map((m) => [m.type, m.delta, m.lotId])).toEqual([["IN", 6, lote.id]]);

            // Sin stock inicial no hay nada que fechar; y `"false"` es falso, no una cadena no vacía.
            expect((await comoAdmin.post("/products", { name: "Kéfir", price: 3, tracksLots: true })).status).toBe(201);
            expect((await comoAdmin.post("/products", { name: "Tornillo", price: 3, stock: 2, tracksLots: "false" })).body.data.tracksLots).toBe(false);
        });

        it("subir el total desde la ficha de un producto con lotes se rechaza; bajarlo sale por caducidad", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 4, dia(5), "A");
            await recibirLote(p, 4, dia(9), "B");

            const sube = await comoAdmin.put(`/products/${p.id}`, { stock: 10 });
            expect(sube.status).toBe(400);
            expect(sube.body.code).toBe("LOT_EXPIRY_REQUIRED");
            expect(await total(p.id)).toBe(8);

            expect((await comoAdmin.put(`/products/${p.id}`, { stock: 3 })).status).toBe(200);
            expect(await enLote((await loteDe(p.id, "A")).id)).toBe(0);
            expect(await enLote((await loteDe(p.id, "B")).id)).toBe(3);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el movimiento a mano", () => {
        it("una entrada dice su lote por la fecha, o por un lote que ya existe", async () => {
            const p = await conLotes("Yogur");

            const sinNada = await mover(p, { type: "IN", quantity: 2 });
            expect(sinNada.status).toBe(400);
            expect(sinNada.body.code).toBe("LOT_EXPIRY_REQUIRED");

            expect((await mover(p, { type: "IN", quantity: 2, expiresAt: dia(8), lotCode: "M-1" })).status).toBe(201);
            const lote = await loteDe(p.id, "M-1");
            expect((await mover(p, { type: "IN", quantity: 3, lotId: lote.id })).status).toBe(201);
            expect(await enLote(lote.id)).toBe(5);

            const otro = await conLotes("Kéfir");
            const ajeno = await mover(otro, { type: "IN", quantity: 1, lotId: lote.id });
            expect(ajeno.status).toBe(404);
            expect(ajeno.body.code).toBe("LOT_NOT_FOUND");
        });

        it("una salida sin lote sigue el orden de caducidad, vencido incluido: una merma no elige", async () => {
            const p = await conLotes("Yogur");
            const caducado = await ponerLote(p.id, "VIEJO", dia(-2), 3);
            const bueno = await ponerLote(p.id, "BUENO", dia(20), 3);

            expect((await mover(p, { type: "OUT", quantity: 4 })).status).toBe(201);

            expect(await enLote(caducado.id)).toBe(0);
            expect(await enLote(bueno.id)).toBe(2);
        });

        it("una salida con lote saca solo de ese lote, aunque sobre en otros", async () => {
            const p = await conLotes("Yogur");
            const a = await ponerLote(p.id, "A", dia(5), 2);
            const b = await ponerLote(p.id, "B", dia(9), 10);

            const demasiado = await mover(p, { type: "OUT", quantity: 3, lotId: a.id });
            expect(demasiado.status).toBe(400);
            expect(demasiado.body.code).toBe("STOCK_CANNOT_BE_NEGATIVE");

            expect((await mover(p, { type: "OUT", quantity: 4, lotId: b.id })).status).toBe(201);
            expect(await enLote(a.id)).toBe(2);
            expect(await enLote(b.id)).toBe(6);
        });

        it("el lote de otro producto no vale tampoco para sacar ni para ajustar: 404, y no «no hay stock»", async () => {
            const p = await conLotes("Yogur");
            await ponerLote(p.id, "A", dia(5), 4);
            const otro = await conLotes("Kéfir");
            const ajeno = await ponerLote(otro.id, "A", dia(5), 4);

            for (const type of ["OUT", "ADJUSTMENT"]) {
                const res = await mover(p, { type, quantity: 1, lotId: ajeno.id });
                expect([type, res.status, res.body.code]).toEqual([type, 404, "LOT_NOT_FOUND"]);
            }
            expect(await total(p.id)).toBe(4);
        });

        it("lo que queda en el almacén tras una salida cuenta también lo que hay en lotes", async () => {
            // Diez sin lote y seis en un lote: sacar tres deja trece en el almacén, no siete.
            const p = await crearProducto({ data: { name: "Queso", price: 20, stock: 10, tracksLots: true } });
            await ponerLote(p.id, "A", dia(9), 6);

            expect((await mover(p, { type: "OUT", quantity: 3 })).status).toBe(201);

            const [salida] = await movimientos(p.id, { type: "OUT" });
            expect(salida).toMatchObject({ delta: -3, lotId: null, stockAfter: 13, warehouseStockAfter: 13 });
            expect(await sinLote(p.id)).toBe(7);
        });

        it("dar de baja un lote caducado es un ajuste a cero de ese lote: no toca los demás ni cuenta como salida", async () => {
            const p = await conLotes("Yogur");
            const caducado = await ponerLote(p.id, "VIEJO", dia(-2), 7);
            const bueno = await ponerLote(p.id, "BUENO", dia(20), 5);

            const res = await mover(p, { type: "ADJUSTMENT", quantity: 0, lotId: caducado.id, reason: "Caducado" });

            expect(res.status).toBe(201);
            expect(await enLote(caducado.id)).toBe(0);
            expect(await enLote(bueno.id)).toBe(5);
            expect(await total(p.id)).toBe(5);
            // `ADJUSTMENT` y no `OUT`: la rotación y la reposición cuentan salidas, y tirar no es vender.
            expect((await movimientos(p.id)).map((m) => [m.type, m.delta, m.lot?.code, m.note])).toEqual([["ADJUSTMENT", -7, "VIEJO", "Caducado"]]);
            expect((await comoAdmin.get(`/products/${p.id}`)).body.data).toMatchObject({ stock: 5, expiredStock: 0, availableStock: 5 });
            // Repetirlo no hace nada: ya está a cero.
            expect((await mover(p, { type: "ADJUSTMENT", quantity: 0, lotId: caducado.id })).status).toBe(201);
            expect(await prisma.stockMovement.count()).toBe(1);
        });

        it("un ajuste con lote fija lo que hay de ese lote, hacia arriba o hacia abajo", async () => {
            const p = await conLotes("Yogur");
            const a = await ponerLote(p.id, "A", dia(5), 4);
            await ponerLote(p.id, "B", dia(9), 10);

            await mover(p, { type: "ADJUSTMENT", quantity: 6, lotId: a.id });
            expect(await enLote(a.id)).toBe(6);
            await mover(p, { type: "ADJUSTMENT", quantity: 1, lotId: a.id });
            expect(await enLote(a.id)).toBe(1);
            expect(await total(p.id)).toBe(11);
        });

        it("un ajuste sin lote fija el almacén entero: lo que sobra queda sin lote y lo que falta sale por caducidad", async () => {
            const p = await conLotes("Yogur");
            const a = await ponerLote(p.id, "A", dia(5), 4);
            const b = await ponerLote(p.id, "B", dia(9), 4);

            await mover(p, { type: "ADJUSTMENT", quantity: 10 });
            expect(await sinLote(p.id)).toBe(2);

            await mover(p, { type: "ADJUSTMENT", quantity: 3 });
            expect([await sinLote(p.id), await enLote(a.id), await enLote(b.id)]).toEqual([0, 0, 3]);
        });

        it("cero unidades solo vale en un ajuste", async () => {
            const p = await crearProducto({ data: { name: "Tornillo", price: 1, stock: 5 } });

            expect((await mover(p, { type: "IN", quantity: 0 })).status).toBe(422);
            expect((await mover(p, { type: "OUT", quantity: 0 })).status).toBe(422);
            expect((await mover(p, { type: "ADJUSTMENT", quantity: -1 })).status).toBe(422);
            expect((await mover(p, { type: "ADJUSTMENT", quantity: 0 })).status).toBe(201);
            expect(await total(p.id)).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que se deshace vuelve a su lote", () => {
        it("cancelar una venta enviada devuelve cada unidad al lote del que salió, aunque ya haya caducado", async () => {
            const p = await crearProducto({ data: { name: "Queso", price: 20, stock: 2, tracksLots: true } });
            const a = await ponerLote(p.id, "A", dia(3), 3);
            const b = await ponerLote(p.id, "B", dia(30), 3);
            const { body } = await vender(p, 7);
            await enviar(body.data.id);
            expect([await sinLote(p.id), await enLote(a.id), await enLote(b.id)]).toEqual([0, 0, 1]);

            // El lote A caduca antes de que la venta se cancele.
            await prisma.lot.update({ where: { id: a.id }, data: { expiresAt: new Date(`${dia(-1)}T00:00:00Z`) } });
            const res = await comoAdmin.patch(`/sale-orders/${body.data.id}`, { status: "CANCELLED" });

            expect(res.status).toBe(200);
            expect([await sinLote(p.id), await enLote(a.id), await enLote(b.id)]).toEqual([2, 3, 3]);
            expect(await total(p.id)).toBe(8);
            // Lo devuelto al lote caducado está, pero no se puede volver a vender.
            expect((await comoAdmin.get(`/products/${p.id}`)).body.data).toMatchObject({ stock: 8, expiredStock: 3, availableStock: 5 });
            // La venta anulada sigue diciendo de qué lotes salió: su comprobante ya se entregó.
            expect(res.body.data.items[0].lots.map((l: { code: string; quantity: number }) => [l.code, l.quantity])).toEqual([["A", 3], ["B", 2]]);
        });

        it("cancelar una compra retira lo recibido de su lote, y no de otro aunque sobre", async () => {
            const p = await conLotes("Yogur");
            const orden = await recibirLote(p, 5, dia(10), "COMPRA");
            await recibirLote(p, 20, dia(40), "OTRA");
            const lote = await loteDe(p.id, "COMPRA");

            // Se venden dos del lote de la compra: quedan tres de cinco.
            await enviar((await vender(p, 2)).body.data.id);
            const rechazada = await comoAdmin.patch(`/purchase-orders/${orden.id}`, { status: "CANCELLED" });
            expect(rechazada.status).toBe(400);
            expect(rechazada.body).toMatchObject({ code: "CANNOT_CANCEL_UNITS_CONSUMED", params: { disponible: 3, requerido: 5 } });
            expect(await total(p.id)).toBe(23);

            // Con el lote entero otra vez, sí; y el otro lote no se toca.
            await mover(p, { type: "IN", quantity: 2, lotId: lote.id });
            expect((await comoAdmin.patch(`/purchase-orders/${orden.id}`, { status: "CANCELLED" })).status).toBe(200);
            expect(await enLote(lote.id)).toBe(0);
            expect(await enLote((await loteDe(p.id, "OTRA")).id)).toBe(20);
        });

        it("una compra recibida en dos lotes se cancela retirando de los dos lo suyo", async () => {
            const p = await conLotes("Yogur");
            const orden = await comprar(p, 10);
            await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 4, expiresAt: dia(10), lotCode: "UNO" }]);
            await recibir(orden, [{ itemId: orden.items[0]!.id, quantity: 6, expiresAt: dia(20), lotCode: "DOS" }]);

            expect((await comoAdmin.patch(`/purchase-orders/${orden.id}`, { status: "CANCELLED" })).status).toBe(200);

            expect(await total(p.id)).toBe(0);
            const retiradas = await movimientos(p.id, { type: "OUT" });
            expect(retiradas.map((m) => [m.lot?.code, m.delta]).sort()).toEqual([["DOS", -6], ["UNO", -4]]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("transferencias y conteos", () => {
        it("lo transferido conserva su lote, y un producto en dos lotes sigue siendo una línea", async () => {
            const p = await conLotes("Yogur");
            const a = await ponerLote(p.id, "A", dia(5), 3);
            const b = await ponerLote(p.id, "B", dia(9), 5);

            const res = await comoAlmacen.post("/stock-transfers", { fromWarehouseId: ALMACEN, toWarehouseId: norte, items: [{ productId: p.id, quantity: 4 }] });

            expect(res.status).toBe(201);
            expect(() => transferenciaConLineasSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data).toMatchObject({ lines: 1, units: 4, items: [{ productId: p.id, quantity: 4, fromStockAfter: 4, toStockAfter: 4 }] });
            expect([await enLote(a.id), await enLote(a.id, norte), await enLote(b.id), await enLote(b.id, norte)]).toEqual([0, 3, 4, 1]);
            expect(await total(p.id)).toBe(8);
            // Dos movimientos por lote tocado, todos con el total sin cambiar.
            const deLaTransferencia = await movimientos(p.id, { type: "TRANSFER" });
            expect(deLaTransferencia).toHaveLength(4);
            expect(new Set(deLaTransferencia.map((m) => m.stockAfter))).toEqual(new Set([8]));
            // El listado cuenta productos, no movimientos.
            expect((await comoAdmin.get("/stock-transfers")).body.data.data[0]).toMatchObject({ lines: 1, units: 4 });
            // Y desde el norte se vende por el mismo orden.
            const venta = await enviar((await vender(p, 4, { warehouseId: norte })).body.data.id);
            expect(venta.body.data.items[0].lots.map((l: { code: string; quantity: number }) => [l.code, l.quantity])).toEqual([["A", 3], ["B", 1]]);
        });

        it("lo que se puede transferir descuenta a la vez lo caducado y lo comprometido", async () => {
            // Cinco buenas, cinco caducadas y cuatro prometidas en una venta pendiente: queda una.
            const p = await conLotes("Yogur");
            await ponerLote(p.id, "VIEJO", dia(-2), 5);
            await ponerLote(p.id, "BUENO", dia(20), 5);
            expect((await vender(p, 4)).status).toBe(201);

            const cuerpo = (quantity: number) => ({ fromWarehouseId: ALMACEN, toWarehouseId: norte, items: [{ productId: p.id, quantity }] });
            const demasiado = await comoAlmacen.post("/stock-transfers", cuerpo(2));
            expect(demasiado.status).toBe(409);
            expect(demasiado.body).toMatchObject({ code: "INSUFFICIENT_AVAILABLE_STOCK", params: { disponible: 1, requerido: 2 } });
            expect(await suma({ productId: p.id, warehouseId: norte })).toBe(0);

            expect((await comoAlmacen.post("/stock-transfers", cuerpo(1))).status).toBe(201);
        });

        it("las líneas de una transferencia no dependen del orden en que la base devuelva sus movimientos", () => {
            const mov = (delta: number, warehouseStockAfter: number) => ({ productId: "p", delta, warehouseStockAfter, product: { name: "Yogur", sku: null } });
            // Dos lotes: del origen salen 3 (quedan 5) y luego 1 (quedan 4); al destino llegan 3 y luego 1 (4).
            const enOrden = [mov(-3, 5), mov(3, 3), mov(-1, 4), mov(1, 4)];
            const esperado = [{ productId: "p", name: "Yogur", sku: null, quantity: 4, fromStockAfter: 4, toStockAfter: 4 }];

            expect(lineasDe(enOrden)).toEqual(esperado);
            expect(lineasDe([...enOrden].reverse())).toEqual(esperado);
            expect(lineasDe([])).toEqual([]);
        });

        it("al cerrar un conteo, lo que sobra queda sin lote y lo que falta sale por caducidad", async () => {
            const sobra = await conLotes("Yogur");
            const falta = await conLotes("Kéfir");
            await ponerLote(sobra.id, "S", dia(5), 4);
            const f1 = await ponerLote(falta.id, "F1", dia(5), 4);
            const f2 = await ponerLote(falta.id, "F2", dia(9), 4);

            const conteo = (await comoAlmacen.post("/inventory-counts", {})).body.data as { id: string };
            await comoAlmacen.patch(`/inventory-counts/${conteo.id}/lines`, {
                items: [{ productId: sobra.id, countedQuantity: 6 }, { productId: falta.id, countedQuantity: 3 }],
            });
            expect((await comoAlmacen.post(`/inventory-counts/${conteo.id}/close`)).status).toBe(200);

            expect(await sinLote(sobra.id)).toBe(2);
            expect([await enLote(f1.id), await enLote(f2.id)]).toEqual([0, 3]);
            expect(await total(falta.id)).toBe(3);
        });

        it("el resumen de un almacén cuenta productos, no lotes", async () => {
            const p = await conLotes("Yogur", { costPrice: 2 });
            await ponerLote(p.id, "A", dia(5), 3);
            await ponerLote(p.id, "B", dia(9), 5);

            const principal = ((await comoAdmin.get("/warehouses/summary")).body.data as Array<{ id: string; products: number; units: number; costValue: number }>).find((w) => w.id === ALMACEN)!;
            expect(principal).toMatchObject({ products: 1, units: 8, costValue: 16 });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("marcar y desmarcar", () => {
        it("marcar un producto con stock no mueve nada: lo que había queda sin lote", async () => {
            const p = await crearProducto({ data: { name: "Queso", price: 20, stock: 9 } });

            const res = await comoAdmin.put(`/products/${p.id}`, { tracksLots: "true" });

            expect(res.body.data.tracksLots).toBe(true);
            expect(await sinLote(p.id)).toBe(9);
            expect(await prisma.stockMovement.count()).toBe(0);
            // No tocar el campo no lo cambia.
            expect((await comoAdmin.put(`/products/${p.id}`, { name: "Queso curado" })).body.data.tracksLots).toBe(true);
        });

        it("desmarcarlo no pierde los lotes que ya tiene: siguen saliendo por caducidad y sin venderse caducados", async () => {
            const p = await conLotes("Yogur");
            const caducado = await ponerLote(p.id, "VIEJO", dia(-1), 2);
            await ponerLote(p.id, "TARDE", dia(40), 3);
            await ponerLote(p.id, "PRONTO", dia(4), 3);
            await comoAdmin.put(`/products/${p.id}`, { tracksLots: false });

            // Ya no pide lote al entrar…
            expect((await mover(p, { type: "IN", quantity: 1 })).status).toBe(201);
            // …pero lo que tiene lote se sigue comportando como tal.
            expect((await comoAdmin.get(`/products/${p.id}`)).body.data).toMatchObject({ stock: 9, expiredStock: 2, availableStock: 7 });
            const res = await enviar((await vender(p, 5)).body.data.id);
            expect(res.body.data.items[0].lots.map((l: { code: string; quantity: number }) => [l.code, l.quantity])).toEqual([["PRONTO", 3], ["TARDE", 1]]);
            expect(await enLote(caducado.id)).toBe(2);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que se lee", () => {
        it("los lotes de un producto: con existencias, por orden de salida y con dónde está cada uno", async () => {
            const p = await crearProducto({ data: { name: "Queso", price: 20, stock: 2, tracksLots: true } });
            const caducado = await ponerLote(p.id, "VIEJO", dia(-4), 1);
            const a = await ponerLote(p.id, "A", dia(6), 3);
            await ponerLote(p.id, "A", dia(6), 2, norte);
            const agotado = await ponerLote(p.id, "AGOTADO", dia(2), 1);
            await mover(p, { type: "ADJUSTMENT", quantity: 0, lotId: agotado.id });

            const res = await comoAdmin.get(`/products/${p.id}/lots`);

            expect(res.status).toBe(200);
            expect(() => lotesDeProductoSchema.parse(res.body.data)).not.toThrow();
            const datos = res.body.data as LotesDeProducto;
            expect(datos.withoutLot).toBe(2);
            expect(datos.lots).toEqual([
                { id: caducado.id, code: "VIEJO", expiresAt: dia(-4), daysLeft: -4, expired: true, stock: 1, levels: [{ warehouseId: ALMACEN, stock: 1 }] },
                {
                    id: a.id, code: "A", expiresAt: dia(6), daysLeft: 6, expired: false, stock: 5,
                    levels: [{ warehouseId: ALMACEN, stock: 3 }, { warehouseId: norte, stock: 2 }].sort((x, y) => x.warehouseId.localeCompare(y.warehouseId)),
                },
            ]);

            // El que caduca hoy no ha caducado: le quedan cero días, y todavía se vende.
            await ponerLote(p.id, "HOY", dia(0), 1);
            const hoy = ((await comoAdmin.get(`/products/${p.id}/lots`)).body.data as LotesDeProducto).lots.find((l) => l.code === "HOY")!;
            expect(hoy).toMatchObject({ daysLeft: 0, expired: false });

            expect((await comoAdmin.get("/products/11111111-1111-4111-8111-111111111111/lots")).status).toBe(404);
            expect((await request(app).get(`${API}/products/${p.id}/lots`).set("Cookie", vendedor)).status).toBe(200);
        });

        it("el histórico dice el lote de cada movimiento, con la caducidad como día, y lo exporta", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 5, dia(12), "H-1");

            const res = await comoAdmin.get(`/products/${p.id}/movements`);
            expect(() => movimientosDeProductoSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data.movements[0].lot).toEqual({ id: (await loteDe(p.id, "H-1")).id, code: "H-1", expiresAt: dia(12) });
            expect(res.body.data.product.tracksLots).toBe(true);

            const csv = (await comoAdmin.get(`/products/${p.id}/movements/export?format=csv`)).text.trim().split(/\r?\n/);
            expect(csv[0]!.endsWith(",lotCode,lotExpiresAt")).toBe(true);
            expect(csv[1]!.endsWith(`,H-1,${dia(12)}`)).toBe(true);
        });

        it("el comprobante dice de qué lotes salió cada línea", () => {
            expect(lotesDeLaLinea(undefined)).toBe("");
            expect(lotesDeLaLinea([])).toBe("");
            expect(lotesDeLaLinea([{ code: "L-20261231", expiresAt: "2026-12-31", quantity: 4 }])).toBe("Lote L-20261231 · cad. 31/12/2026");
            // Con más de uno, cada cual dice cuántas unidades son suyas.
            expect(lotesDeLaLinea([{ code: "A", expiresAt: "2026-12-31", quantity: 4 }, { code: "B", expiresAt: "2027-01-05", quantity: 1 }])).toBe(
                "Lote A · cad. 31/12/2026 (4)   Lote B · cad. 05/01/2027 (1)",
            );
        });

        it("el PDF del comprobante de una venta con lotes se genera", async () => {
            const p = await conLotes("Yogur");
            await recibirLote(p, 5, dia(12), "PDF-1");
            const { body } = await vender(p, 2);
            await enviar(body.data.id);

            const res = await comoAdmin.get(`/sale-orders/${body.data.id}/receipt`);

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/pdf");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el aviso de lotes que caducan", () => {
        const avisos = () => prisma.notification.findMany({ where: { type: "LOT_EXPIRING" }, orderBy: { entityId: "asc" } });

        it("avisa a cada administrador de los lotes con existencias que entran en el plazo, una sola vez", async () => {
            await createUser({ email: "lotes_admin2@example.com", role: "ADMIN" });
            const p = await conLotes("Yogur");
            const dentro = await ponerLote(p.id, "DENTRO", dia(10), 4);
            await ponerLote(p.id, "DENTRO", dia(10), 2, norte);
            const caducado = await ponerLote(p.id, "CADUCADO", dia(-1), 1);
            await ponerLote(p.id, "LEJOS", dia(45), 9);
            const agotado = await ponerLote(p.id, "AGOTADO", dia(3), 1);
            await mover(p, { type: "ADJUSTMENT", quantity: 0, lotId: agotado.id });

            await notificationsService.mantener();

            const creados = await avisos();
            // Dos lotes, dos administradores. Ni el que vence lejos, ni el agotado, ni para el almacenero.
            expect(creados).toHaveLength(4);
            expect(new Set(creados.map((a) => a.entityId))).toEqual(new Set([dentro.id, caducado.id]));
            const delLote = creados.find((a) => a.entityId === dentro.id)!;
            // Las unidades son las de todos los almacenes.
            expect(delLote.data).toEqual({ productName: "Yogur", lotCode: "DENTRO", expiresAt: dia(10), units: 6 });
            expect(() => avisoSchema.parse({ ...delLote, readAt: null, createdAt: delLote.createdAt.toISOString() })).not.toThrow();

            // Repetirlo no apila otro ni reabre el que ya se leyó.
            await prisma.notification.updateMany({ data: { readAt: new Date() } });
            await notificationsService.mantener();
            expect((await avisos()).filter((a) => a.readAt === null)).toHaveLength(0);
            expect(await avisos()).toHaveLength(4);
        });

        it("el plazo es el de Configuración", async () => {
            const p = await conLotes("Yogur");
            await ponerLote(p.id, "A", dia(45), 1);

            await notificationsService.mantener();
            expect(await avisos()).toHaveLength(0);

            await comoAdmin.patch("/settings", { expiryWarningDays: 60 });
            await notificationsService.mantener();
            expect(await avisos()).toHaveLength(1);
        });

        it("el ajuste solo admite un entero de días entre 0 y 730", async () => {
            for (const malo of [-1, 1.5, 731, "30"]) {
                expect([malo, (await comoAdmin.patch("/settings", { expiryWarningDays: malo })).status]).toEqual([malo, 422]);
            }
            expect((await comoAdmin.patch("/settings", { expiryWarningDays: 0 })).status).toBe(200);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la base", () => {
        it("el índice único de los niveles trata dos «sin lote» como la misma fila", async () => {
            // Si falla: la base se sincronizó con `prisma db push`, que crea el índice sin
            // `NULLS NOT DISTINCT`. Hay que ejecutar el SQL de la migración (CONTEXTO.md §4).
            const [indice] = await prisma.$queryRaw<Array<{ indnullsnotdistinct: boolean }>>`
                SELECT i.indnullsnotdistinct FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                WHERE c.relname = 'stock_levels_productId_warehouseId_lotId_key'`;
            expect(indice).toEqual({ indnullsnotdistinct: true });

            const p = await crearProducto({ data: { name: "Tornillo", price: 1, stock: 5 } });
            await expect(prisma.stockLevel.create({ data: { productId: p.id, warehouseId: ALMACEN, stock: 0 } })).rejects.toThrow();
        });

        it("diez entradas sin lote al mismo producto son una fila, no diez", async () => {
            const p = await crearProducto({ data: { name: "Tornillo", price: 1 } });

            await Promise.all(Array.from({ length: 10 }, () => mover(p, { type: "IN", quantity: 1 })));

            expect(await prisma.stockLevel.count({ where: { productId: p.id } })).toBe(1);
            expect(await total(p.id)).toBe(10);
        });

        it("borrar un producto se lleva sus lotes y sus niveles", async () => {
            const p = await conLotes("Yogur");
            await ponerLote(p.id, "A", dia(5), 3);

            await prisma.stockMovement.deleteMany({ where: { productId: p.id } });
            await prisma.product.delete({ where: { id: p.id } });

            expect(await prisma.lot.count()).toBe(0);
            expect(await prisma.stockLevel.count()).toBe(0);
        });
    });
});
