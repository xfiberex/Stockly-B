import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, crearProducto, ponerStock } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-07 — conteo físico de inventario.
 *
 * Lo que más vigila este archivo es la decisión de la ficha: **contra qué stock se compara**.
 * Cada línea guarda el esperado al contarla y el cierre aplica la diferencia sobre el stock de
 * ese momento, así que lo vendido o recibido entre contar y cerrar no se lee como merma.
 */

const CONTEOS = "/api/v1/inventory-counts";

describe("Conteo físico de inventario (T5-07)", () => {
    let almacen: string;
    let usuario: string;

    beforeAll(async () => {
        await cleanDb();
        almacen = getAuthCookie((await createUser({ email: "cf_almacen@example.com", role: "WAREHOUSE" })).id);
        usuario = getAuthCookie((await createUser({ email: "cf_user@example.com", role: "USER" })).id);
        await createUser({ email: "cf_admin@example.com", role: "ADMIN" });
    });

    afterEach(async () => {
        await prisma.inventoryCount.deleteMany();
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const producto = (name: string, stock: number, extra: { categoryId?: string; costPrice?: number; isActive?: boolean } = {}) =>
        crearProducto({ data: { name, price: 20, stock, ...extra } });

    const stockDe = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

    async function abrir(cuerpo: Record<string, unknown> = {}) {
        const res = await request(app).post(CONTEOS).set("Cookie", almacen).send(cuerpo);
        expect(res.status).toBe(201);
        return res.body.data as { id: string; summary: Record<string, number> };
    }

    const anotar = (id: string, items: Array<{ productId: string; countedQuantity: number }>) =>
        request(app).patch(`${CONTEOS}/${id}/lines`).set("Cookie", almacen).send({ items });

    const cerrar = (id: string) => request(app).post(`${CONTEOS}/${id}/close`).set("Cookie", almacen);

    describe("El criterio", () => {
        it("contar 8 donde el sistema espera 10 no mueve nada hasta cerrar, y cerrar genera un ADJUSTMENT de −2", async () => {
            const p = await producto("Teclado", 10);
            const { id } = await abrir();

            expect((await anotar(id, [{ productId: p.id, countedQuantity: 8 }])).status).toBe(200);
            expect(await stockDe(p.id)).toBe(10);
            expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(0);

            const res = await cerrar(id);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("CLOSED");
            expect(await stockDe(p.id)).toBe(8);
            const movimientos = await prisma.stockMovement.findMany({ where: { productId: p.id } });
            expect(movimientos).toEqual([
                expect.objectContaining({ type: "ADJUSTMENT", delta: -2, stockAfter: 8, note: `Conteo #${id.slice(0, 8).toUpperCase()}` }),
            ]);
        });

        it("una sesión cancelada no mueve nada, y después no admite ni cifras ni cierre", async () => {
            const p = await producto("Ratón", 10);
            const { id } = await abrir();
            await anotar(id, [{ productId: p.id, countedQuantity: 3 }]);

            const res = await request(app).post(`${CONTEOS}/${id}/cancel`).set("Cookie", almacen);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("CANCELLED");
            expect(await stockDe(p.id)).toBe(10);
            expect(await prisma.stockMovement.count()).toBe(0);
            expect((await anotar(id, [{ productId: p.id, countedQuantity: 4 }])).body.code).toBe("COUNT_NOT_OPEN");
            expect((await cerrar(id)).body.code).toBe("COUNT_NOT_OPEN");
        });

        it("la auditoría registra el cierre con el número de ajustes y de productos sin contar", async () => {
            const [a, b, c, d] = await Promise.all([producto("A", 5), producto("B", 5), producto("C", 5), producto("D", 5)]);
            const { id } = await abrir();
            // Dos con diferencia, uno que cuadra, uno sin contar.
            await anotar(id, [
                { productId: a.id, countedQuantity: 4 },
                { productId: b.id, countedQuantity: 7 },
                { productId: c.id, countedQuantity: 5 },
            ]);

            await cerrar(id);

            const registro = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "COUNT_CLOSE" } });
            expect(registro).toMatchObject({ entity: "InventoryCount", userEmail: "cf_almacen@example.com", details: { ajustes: 2, sinContar: 1 } });
            expect(await stockDe(d.id)).toBe(5);
            expect(await prisma.stockMovement.count({ where: { productId: c.id } })).toBe(0);
        });
    });

    describe("Contra qué stock se compara: el de cuando se contó", () => {
        it("una venta enviada entre contar y cerrar no se convierte en merma", async () => {
            const p = await producto("Monitor", 10);
            const { id } = await abrir();
            await anotar(id, [{ productId: p.id, countedQuantity: 8 }]);

            // Salen 3 después de contar: el stock baja a 7 por su lado.
            await ponerStock(p.id, 7);

            await cerrar(id);

            // Faltaban 2 al contar; se descuentan 2 del stock actual, no «7 − 8 = +1» ni «8».
            expect(await stockDe(p.id)).toBe(5);
        });

        it("volver a contar sobrescribe también el esperado", async () => {
            const p = await producto("Cable", 10);
            const { id } = await abrir();
            await anotar(id, [{ productId: p.id, countedQuantity: 8 }]);
            // Llega mercancía y se vuelve a contar el estante con ella dentro.
            await ponerStock(p.id, 15);

            const res = await anotar(id, [{ productId: p.id, countedQuantity: 13 }]);

            expect(res.body.data[0]).toMatchObject({ countedQuantity: 13, expectedQuantity: 15, difference: -2 });
            await cerrar(id);
            expect(await stockDe(p.id)).toBe(13);
        });

        it("si el ajuste dejara un producto en negativo no se cierra nada, tampoco lo demás", async () => {
            const [p, otro] = await Promise.all([producto("Lámpara", 10), producto("Bombilla", 10)]);
            const { id } = await abrir();
            await anotar(id, [
                { productId: p.id, countedQuantity: 8 },
                { productId: otro.id, countedQuantity: 6 },
            ]);
            // Se contaron 8 de 10 y luego salieron 9: con −2 quedaría en −1.
            await ponerStock(p.id, 1);

            const res = await cerrar(id);

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "COUNT_ADJUSTMENT_NEGATIVE", params: { productos: 1, producto: "Lámpara" } });
            expect(await stockDe(otro.id)).toBe(10);
            expect(await prisma.stockMovement.count()).toBe(0);
            expect((await prisma.inventoryCount.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
        });
    });

    describe("Qué entra en una sesión", () => {
        it("con categoría, solo sus productos activos; sin ella, todo el catálogo activo", async () => {
            const cat = await prisma.category.create({ data: { name: "Periféricos" } });
            await Promise.all([
                producto("En la categoría", 1, { categoryId: cat.id }),
                producto("Inactivo de la categoría", 1, { categoryId: cat.id, isActive: false }),
                producto("Fuera de la categoría", 1),
            ]);

            const conCategoria = await abrir({ categoryId: cat.id });
            expect(conCategoria.summary.lines).toBe(1);
            await request(app).post(`${CONTEOS}/${conCategoria.id}/cancel`).set("Cookie", almacen);

            expect((await abrir()).summary.lines).toBe(2);
        });

        it("un producto no puede estar en dos conteos abiertos; al cerrar el primero, sí", async () => {
            const cat = await prisma.category.create({ data: { name: "Audio" } });
            await producto("Altavoz", 3, { categoryId: cat.id });
            const primero = await abrir({ categoryId: cat.id });

            const res = await request(app).post(CONTEOS).set("Cookie", almacen).send({});

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "PRODUCTS_IN_OPEN_COUNT", params: { productos: 1 } });

            await cerrar(primero.id);
            expect((await request(app).post(CONTEOS).set("Cookie", almacen).send({})).status).toBe(201);
        });

        it("sin productos activos en el filtro no se abre nada", async () => {
            const cat = await prisma.category.create({ data: { name: "Vacía" } });

            const res = await request(app).post(CONTEOS).set("Cookie", almacen).send({ categoryId: cat.id });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("COUNT_WITHOUT_PRODUCTS");
            expect(await prisma.inventoryCount.count()).toBe(0);
        });

        it("anotar un producto que no está en la sesión es un 400, y uno repetido en el lote un 422", async () => {
            const [dentro, fuera] = await Promise.all([producto("Dentro", 1), producto("Fuera", 1, { isActive: false })]);
            const { id } = await abrir();

            const ajeno = await anotar(id, [{ productId: fuera.id, countedQuantity: 1 }]);
            expect(ajeno.status).toBe(400);
            expect(ajeno.body.code).toBe("PRODUCT_NOT_IN_COUNT");

            const repetido = await anotar(id, [
                { productId: dentro.id, countedQuantity: 1 },
                { productId: dentro.id, countedQuantity: 2 },
            ]);
            expect(repetido.status).toBe(422);
        });
    });

    describe("Las líneas y el informe", () => {
        it("a ciegas: una línea sin contar no trae el esperado; filtros por contar, contadas y con diferencia", async () => {
            const [a, b, c] = await Promise.all([producto("Alfa", 5), producto("Beta", 5), producto("Gamma", 5)]);
            const { id } = await abrir();
            await anotar(id, [
                { productId: a.id, countedQuantity: 5 },
                { productId: b.id, countedQuantity: 3 },
            ]);

            const lineas = async (filtro?: string) =>
                (await request(app).get(`${CONTEOS}/${id}/lines${filtro ? `?filter=${filtro}` : ""}`).set("Cookie", usuario)).body.data;

            const todas = await lineas();
            expect(todas.data.map((l: { name: string }) => l.name)).toEqual(["Alfa", "Beta", "Gamma"]);
            expect(todas.data[2]).toMatchObject({ productId: c.id, countedQuantity: null, expectedQuantity: null, difference: null });
            expect((await lineas("pending")).data.map((l: { name: string }) => l.name)).toEqual(["Gamma"]);
            expect((await lineas("counted")).meta.total).toBe(2);
            expect((await lineas("difference")).data).toEqual([expect.objectContaining({ name: "Beta", difference: -2 })]);

            const malo = await request(app).get(`${CONTEOS}/${id}/lines?filter=raro`).set("Cookie", usuario);
            expect(malo.status).toBe(400);
        });

        it("valora las diferencias al coste; cerrada, con el de su cierre aunque el coste cambie después", async () => {
            const [conCoste, sinCoste, sobra] = await Promise.all([
                producto("Con coste", 10, { costPrice: 4 }),
                producto("Sin coste", 10),
                producto("Sobra", 10, { costPrice: 2.5 }),
            ]);
            const { id } = await abrir();
            await anotar(id, [
                { productId: conCoste.id, countedQuantity: 8 },
                { productId: sinCoste.id, countedQuantity: 9 },
                { productId: sobra.id, countedQuantity: 14 },
            ]);

            const abierta = (await request(app).get(`${CONTEOS}/${id}`).set("Cookie", usuario)).body.data.summary;
            expect(abierta).toEqual({
                lines: 3, counted: 3, uncounted: 0, withDifference: 3,
                unitsOver: 4, unitsShort: 3, valueOver: 10, valueShort: 8, linesWithoutCost: 1,
            });

            await cerrar(id);
            await prisma.product.update({ where: { id: conCoste.id }, data: { costPrice: 100 } });

            const cerrada = (await request(app).get(`${CONTEOS}/${id}`).set("Cookie", usuario)).body.data.summary;
            expect(cerrada.valueShort).toBe(8);
            const linea = (await request(app).get(`${CONTEOS}/${id}/lines?filter=difference`).set("Cookie", usuario)).body.data.data
                .find((l: { name: string }) => l.name === "Con coste");
            expect(linea).toMatchObject({ adjustment: -2, unitCost: 4 });
        });

        it("el listado filtra por estado y trae las cifras de cada sesión", async () => {
            await producto("Uno", 1);
            const { id } = await abrir({ note: "Estantería A" });

            const res = await request(app).get(`${CONTEOS}?status=OPEN`).set("Cookie", usuario);

            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(1);
            expect(res.body.data.data[0]).toMatchObject({ id, note: "Estantería A", createdByEmail: "cf_almacen@example.com", summary: { lines: 1, uncounted: 1 } });
            expect((await request(app).get(`${CONTEOS}?status=CLOSED`).set("Cookie", usuario)).body.data.meta.total).toBe(0);
        });
    });

    it("un USER consulta pero no abre, anota ni cierra", async () => {
        const p = await producto("Solo lectura", 2);
        const { id } = await abrir();

        expect((await request(app).post(CONTEOS).set("Cookie", usuario).send({})).status).toBe(403);
        expect((await request(app).patch(`${CONTEOS}/${id}/lines`).set("Cookie", usuario).send({ items: [{ productId: p.id, countedQuantity: 1 }] })).status).toBe(403);
        expect((await request(app).post(`${CONTEOS}/${id}/close`).set("Cookie", usuario)).status).toBe(403);
        expect((await request(app).get(`${CONTEOS}/${id}`).set("Cookie", usuario)).status).toBe(200);
    });

    it("un cierre que llega mientras otro está en curso espera, ve la sesión cerrada y no ajusta otra vez", async () => {
        const p = await producto("Carrera", 10);
        const { id } = await abrir();
        await anotar(id, [{ productId: p.id, countedQuantity: 7 }]);

        // Como en T5-04, la carrera se fuerza: un `Promise.all` no llega a solaparse en la base.
        // Una transacción del test bloquea la sesión y la marca cerrada sin confirmar.
        //  - Con el `FOR UPDATE` del servicio, el cierre espera, lee CLOSED → 400.
        //  - Sin él, lee OPEN y ajusta: el stock acaba en 7 con la sesión «ya cerrada».
        let soltar!: () => void;
        const retenida = new Promise<void>((r) => (soltar = r));
        const otroCierre = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM inventory_counts WHERE id = ${id} FOR UPDATE`;
                await tx.inventoryCount.update({ where: { id }, data: { status: "CLOSED" } });
                await retenida;
            },
            { timeout: 15_000 },
        );
        const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

        await esperar(300);
        const peticion = cerrar(id).then((r) => r);
        await esperar(500);
        soltar();
        await otroCierre;

        const res = await peticion;
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("COUNT_NOT_OPEN");
        expect(await stockDe(p.id)).toBe(10);
        expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(0);
    });
});
