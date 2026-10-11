import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import {
    MAXIMO_DE_LINEAS_DE_TRANSFERENCIA,
    almacenConCifrasSchema,
    almacenSchema,
    conteoSchema,
    movimientoStockSchema,
    nivelEn,
    ordenCompraSchema,
    ordenVentaSchema,
    productoConDisponibleSchema,
    transferenciaConLineasSchema,
    transferenciaSchema,
} from "@/contratos/api";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";
import { entrar, sacar, transferir } from "@/shared/lib/stock";
import { HttpError } from "@/shared/lib/httpError";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const API = "/api/v1";

/**
 * T5-14 — varios almacenes.
 *
 * Lo que se vigila son cuatro cosas. Que **el total de un producto sea siempre la suma de sus
 * almacenes**, y que no dependa de que el código se acuerde: la base se niega a confirmar lo
 * contrario. Que **una transferencia no cambie ese total** y deje sus dos movimientos
 * enlazados. Que cada operación ocurra **en su almacén** —lo que hay en otro local no se vende
 * desde este— mientras el mínimo y su aviso siguen siendo del producto entero. Y que quien no
 * dice almacén siga operando como antes, sobre el predeterminado.
 */
describe("Varios almacenes (T5-14)", () => {
    let admin: string;
    let almacenero: string;
    let norte: string;

    const comoAdmin = {
        get: (ruta: string) => request(app).get(`${API}${ruta}`).set("Cookie", admin),
        post: (ruta: string, cuerpo?: object) => request(app).post(`${API}${ruta}`).set("Cookie", admin).send(cuerpo),
        put: (ruta: string, cuerpo?: object) => request(app).put(`${API}${ruta}`).set("Cookie", admin).send(cuerpo),
        patch: (ruta: string, cuerpo?: object) => request(app).patch(`${API}${ruta}`).set("Cookie", admin).send(cuerpo),
    };

    const producto = (name: string, stock: number, extra: { minStock?: number; costPrice?: number; isActive?: boolean } = {}) =>
        crearProducto({ data: { name, price: 20, stock, ...extra } });

    const total = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
    const nivel = async (productId: string, warehouseId: string) =>
        (await prisma.stockLevel.aggregate({ where: { productId, warehouseId }, _sum: { stock: true } }))._sum.stock ?? 0;

    const transferirPorApi = (items: Array<{ productId: string; quantity: number }>, extra: object = {}, cookie = almacenero) =>
        request(app).post(`${API}/stock-transfers`).set("Cookie", cookie).send({ fromWarehouseId: ALMACEN, toWarehouseId: norte, items, ...extra });

    const vender = (cuerpo: object) => comoAdmin.post("/sale-orders", cuerpo);
    const linea = (p: { id: string; name: string }, quantity: number) => ({ productId: p.id, productName: p.name, quantity, unitPrice: 20 });

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
        admin = getAuthCookie((await createUser({ email: "va_admin@example.com", role: "ADMIN" })).id);
        almacenero = getAuthCookie((await createUser({ email: "va_almacen@example.com", role: "WAREHOUSE" })).id);
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
    describe("el criterio: una transferencia de 10 unidades", () => {
        it("no cambia el stock total y deja dos movimientos enlazados", async () => {
            const p = await producto("Teclado", 25);

            const res = await transferirPorApi([{ productId: p.id, quantity: 10 }], { note: "Reposición" });

            expect(res.status).toBe(201);
            expect(() => transferenciaConLineasSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data).toMatchObject({
                fromWarehouse: { id: ALMACEN, name: "Principal" },
                toWarehouse: { id: norte, name: "Sucursal Norte" },
                note: "Reposición",
                createdByEmail: "va_almacen@example.com",
                lines: 1,
                units: 10,
                items: [{ productId: p.id, name: "Teclado", quantity: 10, fromStockAfter: 15, toStockAfter: 10 }],
            });

            // El total no se ha movido; lo que ha cambiado es dónde está.
            expect(await total(p.id)).toBe(25);
            expect(await nivel(p.id, ALMACEN)).toBe(15);
            expect(await nivel(p.id, norte)).toBe(10);

            const movimientos = await prisma.stockMovement.findMany({ where: { productId: p.id }, orderBy: { delta: "asc" } });
            expect(movimientos).toHaveLength(2);
            const [salida, entrada] = movimientos;
            expect(salida).toMatchObject({ type: "TRANSFER", delta: -10, warehouseId: ALMACEN, warehouseStockAfter: 15, stockAfter: 25 });
            expect(entrada).toMatchObject({ type: "TRANSFER", delta: 10, warehouseId: norte, warehouseStockAfter: 10, stockAfter: 25 });
            // Enlazados: los dos apuntan a la misma transferencia, que es la de la respuesta.
            expect(salida!.transferId).toBe(res.body.data.id);
            expect(entrada!.transferId).toBe(res.body.data.id);
            expect(salida!.note).toBe(entrada!.note);
            expect(salida!.note).toContain("Principal → Sucursal Norte");
        });

        it("queda en la auditoría, con origen, destino y unidades", async () => {
            const p = await producto("Teclado", 25);
            const { body } = await transferirPorApi([{ productId: p.id, quantity: 10 }]);

            const registro = await prisma.auditLog.findFirstOrThrow({ where: { action: "STOCK_TRANSFER" } });
            expect(registro).toMatchObject({
                entity: "StockTransfer",
                entityId: body.data.id,
                userEmail: "va_almacen@example.com",
                details: { origen: "Principal", destino: "Sucursal Norte", lineas: 1, unidades: 10 },
            });
        });

        it("una transferencia no es una salida: ni rotación ni reposición la cuentan", async () => {
            const proveedor = await prisma.supplier.create({ data: { name: "Proveedor" } });
            const p = await crearProducto({ data: { name: "Teclado", price: 20, stock: 25, minStock: 5, supplierId: proveedor.id } });
            await transferirPorApi([{ productId: p.id, quantity: 10 }]);

            const informe = await comoAdmin.get("/reports");
            expect(informe.body.data.stockMetrics).toEqual([]);
            // Con 25 unidades, mínimo 5 y ninguna salida, no hay nada que reponer.
            const sugerencias = await comoAdmin.get("/purchase-orders/suggestions");
            expect(sugerencias.body.data.data).toEqual([]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: la migración pone todo el stock en un almacén y el total no cambia", () => {
        const MIGRACION = path.join(process.cwd(), "prisma", "migrations", "20261010120000_t5_14_varios_almacenes", "migration.sql");
        const sql = readFileSync(MIGRACION, "utf8").replace(/\r\n/g, "\n");

        /** La sentencia del propio archivo que copia el stock a los niveles, no una copia de ella. */
        function sentenciaDeNiveles(): string {
            const inicio = sql.indexOf('INSERT INTO "stock_levels"');
            if (inicio === -1) throw new Error("La migración ya no rellena stock_levels");
            return sql.slice(inicio, sql.indexOf(";", inicio));
        }

        it("la copia del propio archivo deja cada producto con su total en el predeterminado, y los que estaban a cero, sin fila", async () => {
            const [a, b, vacio] = await Promise.all([producto("A", 7), producto("B", 120), producto("Vacío", 0)]);

            // Como estaba la base antes de la migración: productos con stock y ningún nivel. Solo
            // cabe dentro de una transacción —la base no confirma ese estado—, que es justo donde
            // corre la migración; al confirmar, el disparador comprueba que el total cuadra.
            await prisma.$transaction(async (tx) => {
                await tx.stockLevel.deleteMany();
                await tx.$executeRawUnsafe(sentenciaDeNiveles());
            });

            expect(await nivel(a!.id, ALMACEN)).toBe(7);
            expect(await nivel(b!.id, ALMACEN)).toBe(120);
            expect(await prisma.stockLevel.count({ where: { productId: vacio!.id } })).toBe(0);
            expect((await prisma.product.aggregate({ _sum: { stock: true } }))._sum.stock).toBe(127);
            expect((await prisma.stockLevel.aggregate({ _sum: { stock: true } }))._sum.stock).toBe(127);
        });

        it("da a cada movimiento antiguo el saldo de almacén que tenía de total", () => {
            expect(sql).toMatch(/UPDATE "stock_movements"\s+SET "warehouseId" = \(SELECT "id" FROM "warehouses" WHERE "isDefault"\),\s+"warehouseStockAfter" = "stockAfter"/);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el total es la suma de los almacenes, y la base no deja que no lo sea", () => {
        it("la base de tests tiene la guarda (si falla: aplica la migración con `prisma db execute --file`, no con `db push`)", async () => {
            const disparadores = await prisma.$queryRaw<Array<{ tgname: string }>>`
                SELECT tgname FROM pg_trigger WHERE tgname IN ('stock_levels_cuadra', 'products_stock_cuadra') ORDER BY tgname`;
            expect(disparadores.map((d) => d.tgname)).toEqual(["products_stock_cuadra", "stock_levels_cuadra"]);
        });

        it("cambiar solo el total del producto no se confirma", async () => {
            const p = await producto("Teclado", 10);
            await expect(prisma.product.update({ where: { id: p.id }, data: { stock: 11 } })).rejects.toThrow(/no es la suma de sus almacenes/);
            expect(await total(p.id)).toBe(10);
        });

        it("cambiar solo el nivel de un almacén, tampoco", async () => {
            const p = await producto("Teclado", 10);
            await expect(
                prisma.$executeRaw`UPDATE stock_levels SET stock = 9 WHERE "productId" = ${p.id} AND "warehouseId" = ${ALMACEN}`,
            ).rejects.toThrow(/no es la suma de sus almacenes/);
            await expect(prisma.stockLevel.deleteMany({ where: { productId: p.id } })).rejects.toThrow(/no es la suma de sus almacenes/);
            expect(await nivel(p.id, ALMACEN)).toBe(10);
        });

        it("crear un producto con stock y sin nivel, tampoco", async () => {
            await expect(prisma.product.create({ data: { name: "Suelto", price: 1, stock: 5 } })).rejects.toThrow(/no es la suma de sus almacenes/);
            expect(await prisma.product.count()).toBe(0);
        });

        it("los dos cambios en la misma transacción sí, aunque entre uno y otro no cuadre", async () => {
            const p = await producto("Teclado", 10);
            await prisma.$transaction([
                prisma.product.update({ where: { id: p.id }, data: { stock: 14 } }),
                prisma.stockLevel.create({ data: { productId: p.id, warehouseId: norte, stock: 4 } }),
            ]);
            expect(await total(p.id)).toBe(14);
        });

        it("`sacar` no deja nada escrito si en ese almacén no alcanza, aunque el total sí", async () => {
            const p = await producto("Teclado", 10);
            await prisma.$transaction((tx) => entrar(tx, { productId: p.id, warehouseId: norte, cantidad: 3, type: "IN" }));

            const intento = prisma.$transaction((tx) =>
                sacar(tx, { productId: p.id, warehouseId: norte, cantidad: 5, type: "OUT" }, (hay) => new HttpError(400, `hay ${hay}`, "INSUFFICIENT_STOCK")),
            );

            await expect(intento).rejects.toThrow("hay 3");
            expect(await total(p.id)).toBe(13);
            expect(await nivel(p.id, norte)).toBe(3);
            expect(await prisma.stockMovement.count({ where: { type: "OUT" } })).toBe(0);
        });

        it("`transferir` a un producto que no existe es un 404 y no un nivel huérfano", async () => {
            const transferencia = await prisma.stockTransfer.create({ data: { fromWarehouseId: ALMACEN, toWarehouseId: norte } });
            const intento = prisma.$transaction((tx) =>
                transferir(
                    tx,
                    { productId: "11111111-1111-4111-8111-111111111111", fromWarehouseId: ALMACEN, toWarehouseId: norte, cantidad: 1, transferId: transferencia.id },
                    () => new HttpError(409, "no hay"),
                ),
            );
            await expect(intento).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_NOT_FOUND" });
            expect(await prisma.stockLevel.count()).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("transferencias", () => {
        it("es todo o nada: si de un producto no hay bastante, no se mueve ninguno", async () => {
            const [a, b] = await Promise.all([producto("A", 10), producto("B", 2)]);

            const res = await transferirPorApi([{ productId: a!.id, quantity: 5 }, { productId: b!.id, quantity: 3 }]);

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "INSUFFICIENT_AVAILABLE_STOCK", params: { producto: "B", disponible: 2, requerido: 3 } });
            expect(await nivel(a!.id, ALMACEN)).toBe(10);
            expect(await prisma.stockTransfer.count()).toBe(0);
            expect(await prisma.stockMovement.count()).toBe(0);
        });

        it("no se lleva lo comprometido en una venta pendiente del origen", async () => {
            const p = await producto("Teclado", 10);
            expect((await vender({ items: [linea(p, 7)] })).status).toBe(201);

            const deMas = await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            expect(deMas.status).toBe(409);
            expect(deMas.body.params).toMatchObject({ disponible: 3, requerido: 4 });

            expect((await transferirPorApi([{ productId: p.id, quantity: 3 }])).status).toBe(201);
            expect(await nivel(p.id, ALMACEN)).toBe(7);

            // Y lo comprometido es **del origen**: las 7 de la venta lo son en el principal, asi que
            // las 3 que ahora estan en el norte se pueden volver a mover.
            expect((await transferirPorApi([{ productId: p.id, quantity: 3 }], { fromWarehouseId: norte, toWarehouseId: ALMACEN })).status).toBe(201);
            expect(await nivel(p.id, ALMACEN)).toBe(10);
        });

        it("el mismo almacén en los dos extremos es un 400", async () => {
            const p = await producto("Teclado", 10);
            const res = await transferirPorApi([{ productId: p.id, quantity: 1 }], { toWarehouseId: ALMACEN });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe("TRANSFER_SAME_WAREHOUSE");
        });

        it("rechaza un almacén o un producto que no existen, un producto repetido y más líneas de la cuenta", async () => {
            const p = await producto("Teclado", 10);
            const inexistente = "11111111-1111-4111-8111-111111111111";

            const sinAlmacen = await transferirPorApi([{ productId: p.id, quantity: 1 }], { toWarehouseId: inexistente });
            expect(sinAlmacen.status).toBe(404);
            expect(sinAlmacen.body.code).toBe("WAREHOUSE_NOT_FOUND");

            const sinProducto = await transferirPorApi([{ productId: inexistente, quantity: 1 }]);
            expect(sinProducto.status).toBe(404);
            expect(sinProducto.body.code).toBe("PRODUCT_NOT_FOUND");

            expect((await transferirPorApi([{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 2 }])).status).toBe(422);
            expect((await transferirPorApi([{ productId: p.id, quantity: 0 }])).status).toBe(422);
            expect((await transferirPorApi([])).status).toBe(422);

            const muchas = Array.from({ length: MAXIMO_DE_LINEAS_DE_TRANSFERENCIA + 1 }, (_, i) => ({
                productId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
                quantity: 1,
            }));
            expect((await transferirPorApi(muchas)).status).toBe(422);
            expect(await prisma.stockTransfer.count()).toBe(0);
        });

        it("un producto descatalogado sí se puede transferir: hay que poder sacarlo de un local", async () => {
            const p = await producto("Descatalogado", 6, { isActive: false });
            expect((await transferirPorApi([{ productId: p.id, quantity: 6 }])).status).toBe(201);
            expect(await nivel(p.id, norte)).toBe(6);
        });

        it("un USER no transfiere, y no se mueve nada", async () => {
            const p = await producto("Teclado", 10);
            const usuario = getAuthCookie((await createUser({ email: "va_user@example.com", role: "USER" })).id);

            expect((await transferirPorApi([{ productId: p.id, quantity: 1 }], {}, usuario)).status).toBe(403);
            expect(await nivel(p.id, norte)).toBe(0);
        });

        it("el listado va de la más reciente a la más antigua, con sus cifras, y filtra por almacén en cualquiera de los dos extremos", async () => {
            const sur = (await prisma.warehouse.create({ data: { name: "Sucursal Sur" } })).id;
            const [a, b] = await Promise.all([producto("A", 10), producto("B", 10)]);
            await transferirPorApi([{ productId: a!.id, quantity: 2 }, { productId: b!.id, quantity: 3 }]);
            await transferirPorApi([{ productId: a!.id, quantity: 1 }], { fromWarehouseId: norte, toWarehouseId: sur });

            const todas = await comoAdmin.get("/stock-transfers");
            expect(todas.status).toBe(200);
            expect(todas.body.data.meta.total).toBe(2);
            expect(todas.body.data.data.map((t: { lines: number; units: number }) => [t.lines, t.units])).toEqual([[1, 1], [2, 5]]);
            for (const t of todas.body.data.data) expect(() => transferenciaSchema.parse(t)).not.toThrow();

            expect((await comoAdmin.get(`/stock-transfers?warehouseId=${sur}`)).body.data.meta.total).toBe(1);
            expect((await comoAdmin.get(`/stock-transfers?warehouseId=${norte}`)).body.data.meta.total).toBe(2);
            expect((await comoAdmin.get(`/stock-transfers?warehouseId=${ALMACEN}`)).body.data.meta.total).toBe(1);
            expect((await comoAdmin.get("/stock-transfers?warehouseId=11111111-1111-4111-8111-111111111111")).status).toBe(404);

            const detalle = await comoAdmin.get(`/stock-transfers/${todas.body.data.data[1].id}`);
            expect(detalle.body.data.items.map((i: { name: string; quantity: number }) => [i.name, i.quantity])).toEqual([["A", 2], ["B", 3]]);
            const noEsta = await comoAdmin.get("/stock-transfers/11111111-1111-4111-8111-111111111111");
            expect(noEsta.status).toBe(404);
            expect(noEsta.body.code).toBe("STOCK_TRANSFER_NOT_FOUND");
        });

        it("dos transferencias a la vez de las mismas últimas unidades: una pasa y la otra no", async () => {
            const p = await producto("Teclado", 5);

            const respuestas = await Promise.all([
                transferirPorApi([{ productId: p.id, quantity: 5 }]),
                transferirPorApi([{ productId: p.id, quantity: 5 }]),
            ]);

            expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
            expect(await nivel(p.id, ALMACEN)).toBe(0);
            expect(await nivel(p.id, norte)).toBe(5);
            expect(await total(p.id)).toBe(5);
        });

        it("una transferencia y una venta de mostrador a la vez por las mismas unidades: solo una se las lleva", async () => {
            const p = await producto("Teclado", 4);

            const [transferencia, venta] = await Promise.all([
                transferirPorApi([{ productId: p.id, quantity: 4 }]),
                comoAdmin.post("/sale-orders/counter", { items: [{ productId: p.id, quantity: 4 }] }),
            ]);

            expect([transferencia.status, venta.status].sort()).toEqual([201, 409]);
            expect(await nivel(p.id, ALMACEN)).toBe(0);
            // Si ganó la venta, salieron del total; si ganó la transferencia, están en el otro local.
            expect(await total(p.id)).toBe(venta.status === 201 ? 0 : 4);
        });

        it("diez transferencias cruzadas entre dos almacenes no pierden ni inventan unidades", async () => {
            const p = await producto("Teclado", 20);
            await transferirPorApi([{ productId: p.id, quantity: 10 }]);

            const respuestas = await Promise.all(
                Array.from({ length: 10 }, (_, i) =>
                    i % 2 === 0
                        ? transferirPorApi([{ productId: p.id, quantity: 3 }])
                        : transferirPorApi([{ productId: p.id, quantity: 3 }], { fromWarehouseId: norte, toWarehouseId: ALMACEN }),
                ),
            );

            expect(respuestas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
            expect(await total(p.id)).toBe(20);
            expect((await nivel(p.id, ALMACEN)) + (await nivel(p.id, norte))).toBe(20);
            expect(await nivel(p.id, ALMACEN)).toBeGreaterThanOrEqual(0);
            expect(await nivel(p.id, norte)).toBeGreaterThanOrEqual(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("cada venta sale de su almacén", () => {
        it("sin almacén en la petición, sale del predeterminado, como antes de que hubiera varios", async () => {
            const p = await producto("Teclado", 10);

            const res = await vender({ items: [linea(p, 2)] });

            expect(res.status).toBe(201);
            expect(() => ordenVentaSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data).toMatchObject({ warehouseId: ALMACEN, warehouse: { id: ALMACEN, name: "Principal" } });
        });

        it("lo que hay en otro local no se puede vender desde este, y lo comprometido en uno no resta en el otro", async () => {
            const p = await producto("Teclado", 10);

            const sinNada = await vender({ warehouseId: norte, items: [linea(p, 1)] });
            expect(sinNada.status).toBe(409);
            expect(sinNada.body).toMatchObject({ code: "INSUFFICIENT_AVAILABLE_STOCK", params: { disponible: 0, requerido: 1 } });

            await transferirPorApi([{ productId: p.id, quantity: 4 }]);

            // Las 4 del norte, comprometidas; del norte ya no se puede pedir ni una más…
            expect((await vender({ warehouseId: norte, items: [linea(p, 4)] })).status).toBe(201);
            expect((await vender({ warehouseId: norte, items: [linea(p, 1)] })).status).toBe(409);
            // …pero las 6 del principal siguen enteras, y la séptima no existe.
            expect((await vender({ items: [linea(p, 7)] })).status).toBe(409);
            expect((await vender({ items: [linea(p, 6)] })).status).toBe(201);
        });

        it("enviar descuenta del almacén de la orden, y cancelar devuelve allí", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            const { body } = await vender({ warehouseId: norte, items: [linea(p, 3)] });

            const enviada = await comoAdmin.patch(`/sale-orders/${body.data.id}`, { status: "SHIPPED" });
            expect(enviada.status).toBe(200);
            expect(await nivel(p.id, norte)).toBe(1);
            expect(await nivel(p.id, ALMACEN)).toBe(6);
            expect(await total(p.id)).toBe(7);

            const salida = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "OUT" } });
            expect(salida).toMatchObject({ warehouseId: norte, delta: -3, warehouseStockAfter: 1, stockAfter: 7 });
            // Enviada, deja de estar comprometida: lo que queda en el norte se puede vender entero.
            expect(nivelEn((await comoAdmin.get(`/products/${p.id}`)).body.data, norte)).toEqual({ warehouseId: norte, stock: 1, expiredStock: 0, committedStock: 0, availableStock: 1 });

            expect((await comoAdmin.patch(`/sale-orders/${body.data.id}`, { status: "CANCELLED" })).status).toBe(200);
            expect(await nivel(p.id, norte)).toBe(4);
            const vuelta = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "IN" } });
            expect(vuelta).toMatchObject({ warehouseId: norte, delta: 3, warehouseStockAfter: 4, stockAfter: 10 });
        });

        it("enviar falla si el almacén de la orden se quedó sin unidades, aunque el total alcance, y dice lo que hay en él", async () => {
            const p = await producto("Teclado", 10);
            const { body } = await vender({ items: [linea(p, 8)] });
            // Una salida a mano no mira lo comprometido: es como llegan a faltar al enviar.
            await comoAdmin.post(`/products/${p.id}/movements`, { type: "OUT", quantity: 5, reason: "Rotura" });
            await comoAdmin.post(`/products/${p.id}/movements`, { type: "IN", quantity: 20, reason: "Compra", warehouseId: norte });

            const res = await comoAdmin.patch(`/sale-orders/${body.data.id}`, { status: "SHIPPED" });

            expect(await total(p.id)).toBe(25);
            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { producto: "Teclado", disponible: 5, requerido: 8 } });
            expect(await nivel(p.id, ALMACEN)).toBe(5);
        });

        it("la venta de mostrador vende del local que se le diga", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);

            const res = await comoAdmin.post("/sale-orders/counter", { warehouseId: norte, items: [{ productId: p.id, quantity: 4 }] });
            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ status: "SHIPPED", warehouseId: norte });
            expect(await nivel(p.id, norte)).toBe(0);
            expect(await nivel(p.id, ALMACEN)).toBe(6);

            const deMas = await comoAdmin.post("/sale-orders/counter", { warehouseId: norte, items: [{ productId: p.id, quantity: 1 }] });
            expect(deMas.status).toBe(409);
        });

        it("el mínimo es del producto entero: vaciar un local no avisa si el total sigue por encima, y sí cuando baja", async () => {
            const p = await producto("Teclado", 10, { minStock: 5 });
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);

            await comoAdmin.post("/sale-orders/counter", { warehouseId: norte, items: [{ productId: p.id, quantity: 4 }] });
            await esperarAlertasEnVuelo();
            // El norte está a cero, pero quedan 6 en total: por encima del mínimo.
            expect(await prisma.notification.count({ where: { type: "LOW_STOCK" } })).toBe(0);

            await comoAdmin.post("/sale-orders/counter", { items: [{ productId: p.id, quantity: 1 }] });
            await esperarAlertasEnVuelo();
            const aviso = await prisma.notification.findFirstOrThrow({ where: { type: "LOW_STOCK" } });
            expect(aviso.data).toMatchObject({ stock: 5, minStock: 5 });
        });

        it("el listado filtra por almacén, y la exportación dice de cuál salió cada venta", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            await vender({ items: [linea(p, 1)] });
            await vender({ warehouseId: norte, items: [linea(p, 1)] });

            const delNorte = await comoAdmin.get(`/sale-orders?warehouseId=${norte}`);
            expect(delNorte.body.data.meta.total).toBe(1);
            expect(delNorte.body.data.data[0].warehouse.name).toBe("Sucursal Norte");
            expect((await comoAdmin.get("/sale-orders")).body.data.meta.total).toBe(2);
            expect((await comoAdmin.get("/sale-orders?warehouseId=11111111-1111-4111-8111-111111111111")).status).toBe(404);

            const csv = (await comoAdmin.get("/sale-orders/export?format=csv")).text;
            expect(csv.split("\n")[0]!.trim().endsWith(",warehouseName")).toBe(true);
            expect(csv).toContain("Sucursal Norte");
            expect(csv).toContain("Principal");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("cada compra entra en su almacén", () => {
        const comprar = (p: { id: string; name: string }, quantity: number, extra: object = {}) =>
            comoAdmin.post("/purchase-orders", { items: [{ productId: p.id, productName: p.name, quantity, unitPrice: 8 }], ...extra });

        it("recibir mete el stock en el almacén de la orden; el coste medio se pondera con el total", async () => {
            const p = await producto("Teclado", 10, { costPrice: 5 });
            const { body } = await comprar(p, 10, { warehouseId: norte });
            expect(() => ordenCompraSchema.parse(body.data)).not.toThrow();
            expect(body.data.warehouse).toEqual({ id: norte, name: "Sucursal Norte" });

            expect((await comoAdmin.patch(`/purchase-orders/${body.data.id}`, { status: "RECEIVED" })).status).toBe(200);

            expect(await nivel(p.id, norte)).toBe(10);
            expect(await nivel(p.id, ALMACEN)).toBe(10);
            expect(await total(p.id)).toBe(20);
            // 10 a 5 más 10 a 8, aunque en el norte no hubiera ninguna: (50 + 80) / 20.
            expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).costPrice)).toBe(6.5);
            const entrada = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "IN" } });
            expect(entrada).toMatchObject({ warehouseId: norte, warehouseStockAfter: 10, stockAfter: 20 });
            expect(entrada.purchaseOrderItemId).toBe(body.data.items[0].id);
        });

        it("sin almacén en la petición, entra en el predeterminado; y las recepciones parciales, también en el suyo", async () => {
            const p = await producto("Teclado", 0);
            const { body } = await comprar(p, 10);
            expect(body.data.warehouseId).toBe(ALMACEN);

            await request(app).post(`${API}/purchase-orders/${body.data.id}/receipts`).set("Cookie", almacenero)
                .send({ items: [{ itemId: body.data.items[0].id, quantity: 4 }] });

            expect(await nivel(p.id, ALMACEN)).toBe(4);
        });

        it("cancelar retira del almacén al que entró: si las unidades ya no están allí, no se cancela aunque el total alcance", async () => {
            const p = await producto("Teclado", 0);
            const { body } = await comprar(p, 10, { warehouseId: norte });
            await comoAdmin.patch(`/purchase-orders/${body.data.id}`, { status: "RECEIVED" });
            await transferirPorApi([{ productId: p.id, quantity: 6 }], { fromWarehouseId: norte, toWarehouseId: ALMACEN });

            const res = await comoAdmin.patch(`/purchase-orders/${body.data.id}`, { status: "CANCELLED" });

            expect(await total(p.id)).toBe(10);
            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: "CANNOT_CANCEL_UNITS_CONSUMED", params: { producto: "Teclado", disponible: 4, requerido: 10 } });

            await transferirPorApi([{ productId: p.id, quantity: 6 }]);
            expect((await comoAdmin.patch(`/purchase-orders/${body.data.id}`, { status: "CANCELLED" })).status).toBe(200);
            expect(await total(p.id)).toBe(0);
            expect(await nivel(p.id, norte)).toBe(0);
        });

        it("el listado filtra por almacén, y las órdenes generadas desde sugerencias van al que se pida", async () => {
            const proveedor = await prisma.supplier.create({ data: { name: "Proveedor" } });
            const p = await crearProducto({ data: { name: "Teclado", price: 20, stock: 0, minStock: 5, supplierId: proveedor.id } });
            await comprar(p, 1);

            const generadas = await comoAdmin.post("/purchase-orders/suggestions", { warehouseId: norte, items: [{ productId: p.id, quantity: 5, unitPrice: 8 }] });
            expect(generadas.status).toBe(201);

            const delNorte = await comoAdmin.get(`/purchase-orders?warehouseId=${norte}`);
            expect(delNorte.body.data.meta.total).toBe(1);
            expect(delNorte.body.data.data[0].warehouse.name).toBe("Sucursal Norte");
            expect((await comoAdmin.get("/purchase-orders")).body.data.meta.total).toBe(2);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("los ajustes son de un almacén; el stock del formulario del producto es el total", () => {
        const mover = (id: string, cuerpo: object) => comoAdmin.post(`/products/${id}/movements`, { reason: "Prueba", ...cuerpo });

        it("una salida a mano no puede sacar de un local más de lo que hay en él", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 3 }]);

            const res = await mover(p.id, { type: "OUT", quantity: 4, warehouseId: norte });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe("STOCK_CANNOT_BE_NEGATIVE");
            expect(await nivel(p.id, norte)).toBe(3);

            expect((await mover(p.id, { type: "OUT", quantity: 3, warehouseId: norte })).status).toBe(201);
            expect(await total(p.id)).toBe(7);
        });

        it("un ADJUSTMENT deja ese almacén en la cifra, no el total", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 3 }]);

            expect((await mover(p.id, { type: "ADJUSTMENT", quantity: 5, warehouseId: norte })).status).toBe(201);

            expect(await nivel(p.id, norte)).toBe(5);
            expect(await nivel(p.id, ALMACEN)).toBe(7);
            expect(await total(p.id)).toBe(12);
            const ajuste = await prisma.stockMovement.findFirstOrThrow({ where: { type: "ADJUSTMENT" } });
            expect(ajuste).toMatchObject({ delta: 2, warehouseId: norte, warehouseStockAfter: 5, stockAfter: 12 });

            // Ajustar a lo que ya hay no escribe un movimiento de cero.
            expect((await mover(p.id, { type: "ADJUSTMENT", quantity: 5, warehouseId: norte })).status).toBe(201);
            expect(await prisma.stockMovement.count({ where: { type: "ADJUSTMENT" } })).toBe(1);
        });

        it("el ajuste masivo fija el almacén que se le diga y deja los demás como estaban", async () => {
            const [a, b] = await Promise.all([producto("A", 10), producto("B", 10)]);

            const res = await comoAdmin.patch("/products/bulk-stock", { warehouseId: norte, items: [{ productId: a!.id, stock: 4 }, { productId: b!.id, stock: 0 }] });

            expect(res.status).toBe(200);
            expect(await nivel(a!.id, norte)).toBe(4);
            expect(await total(a!.id)).toBe(14);
            expect(await total(b!.id)).toBe(10);
            expect(await prisma.stockMovement.count({ where: { productId: b!.id } })).toBe(0);
        });

        it("reenviar el formulario de un producto repartido en dos locales no mueve nada", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            const antes = await prisma.stockMovement.count();

            const res = await comoAdmin.put(`/products/${p.id}`, { name: "Teclado mecánico", stock: 10 });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ name: "Teclado mecánico", stock: 10 });
            expect(await nivel(p.id, ALMACEN)).toBe(6);
            expect(await nivel(p.id, norte)).toBe(4);
            expect(await prisma.stockMovement.count()).toBe(antes);
        });

        it("cambiar el total mete o saca la diferencia en un almacén, y no saca de él más de lo que tiene", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);

            const sube = await comoAdmin.put(`/products/${p.id}`, { stock: 13 });
            expect(sube.body.data.stock).toBe(13);
            expect(await nivel(p.id, ALMACEN)).toBe(9);

            const baja = await comoAdmin.put(`/products/${p.id}`, { stock: 11, warehouseId: norte });
            expect(baja.body.data.stock).toBe(11);
            expect(await nivel(p.id, norte)).toBe(2);

            // Bajar el total a 1 serían 10 menos, y en el norte quedan 2.
            const deMas = await comoAdmin.put(`/products/${p.id}`, { name: "No debería cambiar", stock: 1, warehouseId: norte });
            expect(deMas.status).toBe(400);
            expect(deMas.body.code).toBe("STOCK_CANNOT_BE_NEGATIVE");
            expect(await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ name: "Teclado", stock: 11 });
        });

        it("un producto nuevo entra con su stock en el almacén que se pida; la importación, en el predeterminado", async () => {
            const creado = await comoAdmin.post("/products", { name: "Nuevo", price: 10, stock: 8, warehouseId: norte });
            expect(creado.status).toBe(201);
            expect(creado.body.data.stock).toBe(8);
            expect(await nivel(creado.body.data.id, norte)).toBe(8);
            const inicial = await prisma.stockMovement.findFirstOrThrow({ where: { productId: creado.body.data.id } });
            expect(inicial).toMatchObject({ type: "IN", delta: 8, warehouseId: norte, warehouseStockAfter: 8, stockAfter: 8, note: "Stock inicial" });

            const importados = await comoAdmin.post("/products/import", { products: [{ name: "Importado", price: 5, stock: 6 }, { name: "A cero", price: 5 }] });
            expect(importados.body.data.created).toBe(2);
            const importado = await prisma.product.findFirstOrThrow({ where: { name: "Importado" } });
            expect(await nivel(importado.id, ALMACEN)).toBe(6);
            expect(await prisma.stockLevel.count({ where: { product: { name: "A cero" } } })).toBe(0);
        });

        it("un SKU repetido no deja ni el producto ni su nivel a medias", async () => {
            await comoAdmin.post("/products", { name: "Uno", price: 10, stock: 3, sku: "REP-1" });
            const repetido = await comoAdmin.post("/products", { name: "Dos", price: 10, stock: 3, sku: "REP-1" });

            expect(repetido.status).toBe(409);
            expect(await prisma.product.count()).toBe(1);
            expect(await prisma.stockLevel.count()).toBe(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("se cuenta un almacén", () => {
        const abrir = (cuerpo: object = {}) => request(app).post(`${API}/inventory-counts`).set("Cookie", almacenero).send(cuerpo);
        const anotar = (id: string, productId: string, countedQuantity: number) =>
            request(app).patch(`${API}/inventory-counts/${id}/lines`).set("Cookie", almacenero).send({ items: [{ productId, countedQuantity }] });
        const cerrar = (id: string) => request(app).post(`${API}/inventory-counts/${id}/close`).set("Cookie", almacenero);

        it("el esperado es lo que hay en ese almacén, y el ajuste del cierre no toca los demás", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);

            const conteo = await abrir({ warehouseId: norte });
            expect(conteo.status).toBe(201);
            expect(() => conteoSchema.parse(conteo.body.data)).not.toThrow();
            expect(conteo.body.data.warehouse).toEqual({ id: norte, name: "Sucursal Norte" });

            const anotada = await anotar(conteo.body.data.id, p.id, 3);
            expect(anotada.body.data[0]).toMatchObject({ expectedQuantity: 4, countedQuantity: 3, difference: -1 });

            expect((await cerrar(conteo.body.data.id)).status).toBe(200);
            expect(await nivel(p.id, norte)).toBe(3);
            expect(await nivel(p.id, ALMACEN)).toBe(6);
            expect(await total(p.id)).toBe(9);
            const ajuste = await prisma.stockMovement.findFirstOrThrow({ where: { type: "ADJUSTMENT" } });
            expect(ajuste).toMatchObject({ delta: -1, warehouseId: norte, warehouseStockAfter: 3, stockAfter: 9 });
        });

        it("un producto que nunca ha estado en el almacén se espera a cero, y contarlo lo da de alta en él", async () => {
            const p = await producto("Teclado", 10);
            const { body } = await abrir({ warehouseId: norte });

            expect((await anotar(body.data.id, p.id, 2)).body.data[0]).toMatchObject({ expectedQuantity: 0, difference: 2 });
            await cerrar(body.data.id);

            expect(await nivel(p.id, norte)).toBe(2);
            expect(await total(p.id)).toBe(12);
        });

        it("el mismo producto puede estar en el conteo abierto de dos almacenes, pero no en dos del mismo", async () => {
            await producto("Teclado", 10);

            expect((await abrir()).status).toBe(201);
            expect((await abrir({ warehouseId: norte })).status).toBe(201);

            const repetido = await abrir({ warehouseId: norte });
            expect(repetido.status).toBe(409);
            expect(repetido.body.code).toBe("PRODUCTS_IN_OPEN_COUNT");

            expect((await comoAdmin.get(`/inventory-counts?warehouseId=${norte}`)).body.data.meta.total).toBe(1);
            expect((await comoAdmin.get("/inventory-counts")).body.data.meta.total).toBe(2);
        });

        it("si entre contar y cerrar salen del almacén más unidades de las que el ajuste deja, no se cierra", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            const { body } = await abrir({ warehouseId: norte });
            await anotar(body.data.id, p.id, 1);
            await transferirPorApi([{ productId: p.id, quantity: 4 }], { fromWarehouseId: norte, toWarehouseId: ALMACEN });

            const res = await cerrar(body.data.id);

            // El total es 10 y el ajuste, −3: cabría de sobra si se mirase el total. En el norte no hay nada.
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "COUNT_ADJUSTMENT_NEGATIVE", params: { productos: 1, producto: "Teclado" } });
            expect(await total(p.id)).toBe(10);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que se lee", () => {
        it("el catálogo y la ficha traen el desglose por almacén, y su suma es lo de siempre", async () => {
            const p = await producto("Teclado", 10);
            const sinStock = await producto("Vacío", 0);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            await vender({ warehouseId: norte, items: [linea(p, 3)] });
            await vender({ items: [linea(p, 1)] });

            const ficha = (await comoAdmin.get(`/products/${p.id}`)).body.data;
            expect(() => productoConDisponibleSchema.parse(ficha)).not.toThrow();
            expect(ficha).toMatchObject({ stock: 10, expiredStock: 0, committedStock: 4, availableStock: 6 });
            expect(nivelEn(ficha, ALMACEN)).toEqual({ warehouseId: ALMACEN, stock: 6, expiredStock: 0, committedStock: 1, availableStock: 5 });
            expect(nivelEn(ficha, norte)).toEqual({ warehouseId: norte, stock: 4, expiredStock: 0, committedStock: 3, availableStock: 1 });

            const lista = (await comoAdmin.get("/products")).body.data.data as Array<{ id: string; stockLevels: unknown[] }>;
            expect(lista.find((x) => x.id === p.id)!.stockLevels).toHaveLength(2);
            // Disperso: el que no tiene nada en ningún sitio no trae filas, y `nivelEn` da ceros.
            const vacio = lista.find((x) => x.id === sinStock.id)!;
            expect(vacio.stockLevels).toEqual([]);
            expect(nivelEn(vacio as never, norte)).toEqual({ warehouseId: norte, stock: 0, expiredStock: 0, committedStock: 0, availableStock: 0 });
        });

        it("el catálogo filtra por lo que hay en un almacén, y un almacén que no existe es un 404", async () => {
            const [a] = await Promise.all([producto("A", 10), producto("B", 10)]);
            await transferirPorApi([{ productId: a!.id, quantity: 10 }]);

            const enElNorte = await comoAdmin.get(`/products?warehouseId=${norte}`);
            expect(enElNorte.body.data.data.map((p: { name: string }) => p.name)).toEqual(["A"]);
            expect(enElNorte.body.data.meta.total).toBe(1);
            // A dejo una fila a cero en el principal: el desglose no la trae.
            expect(enElNorte.body.data.data[0].stockLevels).toEqual([{ warehouseId: norte, stock: 10, expiredStock: 0, committedStock: 0, availableStock: 10 }]);
            // A se quedó a cero en el principal: no «está» en él.
            expect((await comoAdmin.get(`/products?warehouseId=${ALMACEN}`)).body.data.data.map((p: { name: string }) => p.name)).toEqual(["B"]);
            expect((await comoAdmin.get("/products?warehouseId=11111111-1111-4111-8111-111111111111")).status).toBe(404);
        });

        it("el histórico de un producto dice dónde pasó cada cosa, filtra por almacén y lo exporta", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            await comoAdmin.post(`/products/${p.id}/movements`, { type: "OUT", quantity: 1, reason: "Rotura", warehouseId: norte });

            const todos = (await comoAdmin.get(`/products/${p.id}/movements`)).body.data;
            expect(todos.meta.total).toBe(3);
            for (const m of todos.movements) expect(() => movimientoStockSchema.parse(m)).not.toThrow();

            const delNorte = (await comoAdmin.get(`/products/${p.id}/movements?warehouseId=${norte}`)).body.data;
            expect(delNorte.movements.map((m: { type: string; warehouseStockAfter: number }) => [m.type, m.warehouseStockAfter])).toEqual([["OUT", 3], ["TRANSFER", 4]]);
            expect((await comoAdmin.get(`/products/${p.id}/movements?type=TRANSFER`)).body.data.meta.total).toBe(2);

            const csv = (await comoAdmin.get(`/products/${p.id}/movements/export?format=csv&warehouseId=${norte}`)).text.trim().split("\n");
            expect(csv[0]!.trim().endsWith(",warehouseName,warehouseStockAfter,lotCode,lotExpiresAt")).toBe(true);
            expect(csv).toHaveLength(3);
            expect(csv[1]).toContain("Sucursal Norte,4");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("los almacenes", () => {
        it("la lista trae el predeterminado primero y lo que guarda cada uno, a coste solo lo que tiene coste", async () => {
            const conCoste = await producto("Con coste", 10, { costPrice: 2.5 });
            const sinCoste = await producto("Sin coste", 6);
            await producto("Descatalogado", 50, { isActive: false, costPrice: 1 });
            await transferirPorApi([{ productId: conCoste.id, quantity: 4 }, { productId: sinCoste.id, quantity: 6 }]);

            const res = await request(app).get(`${API}/warehouses/summary`).set("Cookie", almacenero);

            expect(res.status).toBe(200);
            for (const a of res.body.data) expect(() => almacenConCifrasSchema.parse(a)).not.toThrow();
            expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(["Principal", "Sucursal Norte"]);
            // En el principal: 6 con coste a 2,5. El descatalogado no cuenta, como en el panel.
            expect(res.body.data[0]).toMatchObject({ isDefault: true, products: 1, units: 6, costValue: 15, unitsWithoutCost: 0 });
            expect(res.body.data[1]).toMatchObject({ isDefault: false, products: 2, units: 10, costValue: 10, unitsWithoutCost: 6 });
        });

        it("la lista de los selectores trae los mismos, en el mismo orden, y ninguna cifra", async () => {
            await comoAdmin.post("/warehouses", { name: "Almacén Central" });

            const res = await request(app).get(`${API}/warehouses`).set("Cookie", almacenero);

            expect(res.status).toBe(200);
            // El predeterminado primero, aunque no sea el primero por nombre.
            expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(["Principal", "Almacén Central", "Sucursal Norte"]);
            for (const a of res.body.data) {
                expect(() => almacenSchema.parse(a)).not.toThrow();
                expect(a).not.toHaveProperty("units");
                expect(a).not.toHaveProperty("costValue");
            }
        });

        it("se da de alta activo, vacío y sin ser el predeterminado; el nombre no se repite", async () => {
            const res = await comoAdmin.post("/warehouses", { name: "  Sucursal Sur  ", address: "Calle 1" });
            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ name: "Sucursal Sur", address: "Calle 1", isDefault: false, isActive: true });

            const repetido = await comoAdmin.post("/warehouses", { name: "Sucursal Sur" });
            expect(repetido.status).toBe(409);
            expect(repetido.body.code).toBe("WAREHOUSE_NAME_EXISTS");
            expect((await comoAdmin.post("/warehouses", { name: "" })).status).toBe(422);

            const renombrado = await comoAdmin.put(`/warehouses/${res.body.data.id}`, { name: "Sucursal Norte" });
            expect(renombrado.status).toBe(409);
            const editado = await comoAdmin.put(`/warehouses/${res.body.data.id}`, { address: "" });
            expect(editado.body.data).toMatchObject({ name: "Sucursal Sur", address: null });
            expect((await comoAdmin.put("/warehouses/11111111-1111-4111-8111-111111111111", { name: "X" })).status).toBe(404);

            expect(await prisma.auditLog.count({ where: { entity: "Warehouse" } })).toBe(2);
        });

        it("el almacén solo lo gestiona un ADMIN", async () => {
            expect((await request(app).post(`${API}/warehouses`).set("Cookie", almacenero).send({ name: "Otro" })).status).toBe(403);
            expect((await request(app).patch(`${API}/warehouses/${norte}/default`).set("Cookie", almacenero)).status).toBe(403);
            expect(await prisma.warehouse.count()).toBe(2);
        });

        it("cambiar el predeterminado deja uno y solo uno, y a él van las operaciones que no dicen almacén", async () => {
            const p = await producto("Teclado", 10);

            const res = await comoAdmin.patch(`/warehouses/${norte}/default`);
            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ id: norte, isDefault: true });
            expect(await prisma.warehouse.findMany({ where: { isDefault: true }, select: { id: true } })).toEqual([{ id: norte }]);

            // Sin almacén, la venta ya mira el norte, donde no hay nada.
            expect((await vender({ items: [linea(p, 1)] })).status).toBe(409);
            await comoAdmin.post(`/products/${p.id}/movements`, { type: "IN", quantity: 2, reason: "Compra" });
            expect(await nivel(p.id, norte)).toBe(2);
        });

        it("cambios de predeterminado a la vez, ronda tras ronda, acaban siempre con uno solo", async () => {
            const sur = (await prisma.warehouse.create({ data: { name: "Sucursal Sur" } })).id;
            const destinos = [norte, sur, ALMACEN];

            // Varias rondas: la carrera que esto vigila -dos cambios que parten de la misma foto y
            // dejan dos marcados- no sale en todas, y una sola ronda la dejaba pasar una vez de cada dos.
            for (let ronda = 0; ronda < 8; ronda++) {
                const respuestas = await Promise.all(
                    Array.from({ length: 12 }, (_, i) => comoAdmin.patch(`/warehouses/${destinos[(i + ronda) % 3]}/default`)),
                );

                expect(respuestas.every((r) => r.status === 200)).toBe(true);
                expect(await prisma.warehouse.count({ where: { isDefault: true } })).toBe(1);
            }
        });

        it("no se desactiva el predeterminado, ni uno con existencias, ni uno con algo sin terminar", async () => {
            const p = await producto("Teclado", 10);

            const predeterminado = await comoAdmin.patch(`/warehouses/${ALMACEN}/deactivate`);
            expect(predeterminado.status).toBe(409);
            expect(predeterminado.body.code).toBe("DEFAULT_WAREHOUSE_REQUIRED");

            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            const conStock = await comoAdmin.patch(`/warehouses/${norte}/deactivate`);
            expect(conStock.status).toBe(409);
            expect(conStock.body).toMatchObject({ code: "WAREHOUSE_NOT_EMPTY", params: { almacen: "Sucursal Norte", unidades: 4 } });

            await transferirPorApi([{ productId: p.id, quantity: 4 }], { fromWarehouseId: norte, toWarehouseId: ALMACEN });
            await comoAdmin.post("/purchase-orders", { warehouseId: norte, items: [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 8 }] });
            const conPendiente = await comoAdmin.patch(`/warehouses/${norte}/deactivate`);
            expect(conPendiente.status).toBe(409);
            expect(conPendiente.body).toMatchObject({ code: "WAREHOUSE_HAS_PENDING", params: { ventas: 0, compras: 1, conteos: 0 } });

            expect((await prisma.warehouse.findUniqueOrThrow({ where: { id: norte } })).isActive).toBe(true);
        });

        it("uno desactivado no admite operaciones nuevas, no puede ser el predeterminado, y vuelve al reactivarlo", async () => {
            const p = await producto("Teclado", 10);
            expect((await comoAdmin.patch(`/warehouses/${norte}/deactivate`)).body.data.isActive).toBe(false);

            const inactivo = (res: { status: number; body: { code?: string } }) => {
                expect(res.status).toBe(409);
                expect(res.body.code).toBe("WAREHOUSE_INACTIVE");
            };
            inactivo(await vender({ warehouseId: norte, items: [linea(p, 1)] }));
            inactivo(await comoAdmin.post("/sale-orders/counter", { warehouseId: norte, items: [{ productId: p.id, quantity: 1 }] }));
            inactivo(await comoAdmin.post("/purchase-orders", { warehouseId: norte, items: [linea(p, 1)] }));
            inactivo(await transferirPorApi([{ productId: p.id, quantity: 1 }]));
            inactivo(await comoAdmin.post(`/products/${p.id}/movements`, { type: "IN", quantity: 1, reason: "Compra", warehouseId: norte }));
            inactivo(await comoAdmin.patch("/products/bulk-stock", { warehouseId: norte, items: [{ productId: p.id, stock: 1 }] }));
            inactivo(await request(app).post(`${API}/inventory-counts`).set("Cookie", almacenero).send({ warehouseId: norte }));
            inactivo(await comoAdmin.patch(`/warehouses/${norte}/default`));
            expect(await nivel(p.id, norte)).toBe(0);

            expect((await comoAdmin.patch(`/warehouses/${norte}/activate`)).body.data.isActive).toBe(true);
            expect((await transferirPorApi([{ productId: p.id, quantity: 1 }])).status).toBe(201);
        });

        it("cancelar una venta enviada no devuelve la mercancía a un almacén desactivado", async () => {
            const p = await producto("Teclado", 10);
            await transferirPorApi([{ productId: p.id, quantity: 4 }]);
            const { body } = await comoAdmin.post("/sale-orders/counter", { warehouseId: norte, items: [{ productId: p.id, quantity: 4 }] });
            expect((await comoAdmin.patch(`/warehouses/${norte}/deactivate`)).status).toBe(200);

            const res = await comoAdmin.patch(`/sale-orders/${body.data.id}`, { status: "CANCELLED" });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("WAREHOUSE_INACTIVE");
            expect(await total(p.id)).toBe(6);
            expect((await prisma.saleOrder.findUniqueOrThrow({ where: { id: body.data.id } })).status).toBe("SHIPPED");
        });
    });
});
