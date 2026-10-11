import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { MAXIMO_DE_LINEAS_DE_MOSTRADOR, PERMISOS, ordenVentaSchema, puede, rolSchema, totalesPrevistos, type RutaConPermiso } from "@/contratos/api";
import { totalesDeLinea } from "@/shared/lib/totalesDeVenta";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";
import { cleanDb, createUser, getAuthCookie, crearProducto, ponerStock } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const VENTAS = "/api/v1/sale-orders";
const MOSTRADOR = `${VENTAS}/counter`;

/**
 * T6-08 — la venta de mostrador y el rol de vendedor.
 *
 * Una venta de mostrador es `create` y el envío en una sola transacción, y lo que se vigila
 * son las tres cosas que la justifican: que **quede hecha entera o no quede nada** —ni orden,
 * ni número, ni cliente, ni stock movido—; que **el precio no lo ponga quien vende**; y que el
 * rol nuevo pueda hacer esto y nada de lo que fija un precio o deshace una venta.
 */
describe("Venta de mostrador y rol de vendedor (T6-08)", () => {
    let vendedor: string;
    let admin: string;
    let teclado: { id: string };
    let raton: { id: string };

    const vender = (cuerpo: Record<string, unknown>, cookie = vendedor) => request(app).post(MOSTRADOR).set("Cookie", cookie).send(cuerpo);
    const producto = (id: string) => prisma.product.findUniqueOrThrow({ where: { id } });

    /** Lo que una venta fallida no puede haber dejado. */
    async function nadaSeHaMovido() {
        expect(await prisma.saleOrder.count()).toBe(0);
        expect(await prisma.stockMovement.count()).toBe(0);
        expect(await prisma.customer.count()).toBe(0);
        expect((await producto(teclado.id)).stock).toBe(10);
        expect((await producto(raton.id)).stock).toBe(4);
    }

    beforeEach(async () => {
        await cleanDb();
        vendedor = getAuthCookie((await createUser({ email: "vendedora@example.com", role: "SELLER" })).id);
        admin = getAuthCookie((await createUser({ email: "admin@example.com", role: "ADMIN" })).id);
        teclado = await crearProducto({ data: { name: "Teclado", price: 50, costPrice: 30.1234, stock: 10, minStock: 2 } });
        raton = await crearProducto({ data: { name: "Ratón", price: 25.5, costPrice: 12, stock: 4, minStock: 1 } });
    });

    afterAll(async () => {
        await esperarAlertasEnVuelo();
        await cleanDb();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: un SELLER vende dos productos y, sin más pasos, está hecho", () => {
        it("el stock ha bajado, hay dos movimientos OUT, la orden está enviada con su coste congelado y el comprobante se descarga", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 3 }, { productId: raton.id, quantity: 1 }] });

            expect(res.status).toBe(201);
            const orden = res.body.data;
            expect(ordenVentaSchema.safeParse(orden).success).toBe(true);
            expect(orden).toMatchObject({ status: "SHIPPED", number: 1, createdByEmail: "vendedora@example.com", subtotal: "175.50", total: "175.50" });
            expect(orden.shippedAt).not.toBeNull();
            expect(orden.items.map((i: { productName: string; quantity: number; unitPrice: string }) => [i.productName, i.quantity, i.unitPrice])).toEqual([
                ["Teclado", 3, "50"],
                ["Ratón", 1, "25.5"],
            ]);

            // El stock.
            expect((await producto(teclado.id)).stock).toBe(7);
            expect((await producto(raton.id)).stock).toBe(3);

            // Los dos movimientos, con el número de la venta y el stock que dejaron.
            const movimientos = await prisma.stockMovement.findMany({ orderBy: { delta: "asc" } });
            expect(movimientos.map((m) => [m.productId, m.type, m.delta, m.stockAfter, m.note])).toEqual([
                [teclado.id, "OUT", -3, 7, "Venta de mostrador #000001"],
                [raton.id, "OUT", -1, 3, "Venta de mostrador #000001"],
            ]);

            // El coste, congelado en cada línea con sus cuatro decimales.
            const lineas = await prisma.saleOrderItem.findMany({ orderBy: { quantity: "desc" } });
            expect(lineas.map((l) => l.unitCost?.toString())).toEqual(["30.1234", "12"]);

            // Y el comprobante, que solo tienen las enviadas, lo descarga quien la vendió.
            const comprobante = await request(app).get(`${VENTAS}/${orden.id}/receipt`).set("Cookie", vendedor);
            expect(comprobante.status).toBe(200);
            expect(comprobante.headers["content-type"]).toBe("application/pdf");
        });

        it("deja rastro con su propia acción, a nombre de quien vendió", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }] });

            const rastro = await prisma.auditLog.findMany({ where: { entityId: res.body.data.id } });
            expect(rastro.map((r) => [r.action, r.entity, r.userEmail])).toEqual([["SALE_COUNTER", "SaleOrder", "vendedora@example.com"]]);
        });

        it("un ADMIN también vende en el mostrador", async () => {
            const res = await vender({ items: [{ productId: raton.id, quantity: 2 }] }, admin);

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ status: "SHIPPED", createdByEmail: "admin@example.com" });
            expect((await producto(raton.id)).stock).toBe(2);
        });

        it("cuenta en lo vendido como cualquier otra venta enviada", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana", email: "ana@example.com" } });
            await vender({ customerId: cliente.id, items: [{ productId: teclado.id, quantity: 2 }] });

            const ficha = await request(app).get(`/api/v1/customers/${cliente.id}`).set("Cookie", vendedor);

            expect(ficha.body.data.summary).toMatchObject({ orders: 1, shipped: 1, pending: 0, shippedRevenue: 100 });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el precio sale del producto, no de la petición", () => {
        it("mandar un precio distinto del catálogo no cambia el de la línea, ni el nombre", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 2, unitPrice: 0.01, productName: "Regalo", taxRate: 0, unitCost: 0 }] });

            expect(res.status).toBe(201);
            expect(res.body.data.items[0]).toMatchObject({ productName: "Teclado", unitPrice: "50", subtotal: "100.00" });
            expect(res.body.data.total).toBe("100.00");
            const guardada = await prisma.saleOrderItem.findFirstOrThrow();
            expect([guardada.unitPrice.toString(), guardada.unitCost?.toString()]).toEqual(["50", "30.1234"]);
        });

        it("tampoco elige el estado, el número ni quién la registra", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }], status: "PENDING", number: 999, createdByEmail: "otra@example.com", total: "0.00" });

            expect(res.body.data).toMatchObject({ status: "SHIPPED", number: 1, createdByEmail: "vendedora@example.com", total: "50.00" });
        });

        it("una línea escrita a mano, sin producto, no es una venta de mostrador: 422", async () => {
            const res = await vender({ items: [{ productName: "Servicio", quantity: 1, unitPrice: 10 }] });

            expect(res.status).toBe(422);
            await nadaSeHaMovido();
        });

        it("el precio es el del instante de la venta: el que tenga el producto entonces", async () => {
            await prisma.product.update({ where: { id: teclado.id }, data: { price: 61.75 } });

            const res = await vender({ items: [{ productId: teclado.id, quantity: 2 }] });

            expect(res.body.data.items[0].unitPrice).toBe("61.75");
            expect(res.body.data.total).toBe("123.50");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("o queda hecha entera o no queda nada", () => {
        it("pedir más de lo disponible responde 409 y no mueve nada", async () => {
            const res = await vender({
                customerName: "Nuevo", customerEmail: "nuevo@example.com",
                items: [{ productId: teclado.id, quantity: 2 }, { productId: raton.id, quantity: 5 }],
            });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("INSUFFICIENT_AVAILABLE_STOCK");
            expect(res.body.params).toEqual({ producto: "Ratón", disponible: 4, requerido: 5 });
            // Ni la orden, ni los movimientos, ni el cliente que su correo habría creado.
            await nadaSeHaMovido();
            expect(await prisma.auditLog.count()).toBe(0);
        });

        it("y tampoco gasta el número: la siguiente venta es la primera", async () => {
            await vender({ items: [{ productId: raton.id, quantity: 5 }] });

            const res = await vender({ items: [{ productId: raton.id, quantity: 1 }] });

            expect(res.body.data.number).toBe(1);
        });

        it("lo disponible descuenta lo comprometido en órdenes pendientes, como en `create`", async () => {
            const pendiente = await request(app).post(VENTAS).set("Cookie", admin)
                .send({ items: [{ productId: raton.id, productName: "Ratón", quantity: 3, unitPrice: 25.5 }] });
            expect(pendiente.status).toBe(201);

            const res = await vender({ items: [{ productId: raton.id, quantity: 2 }] });

            // Hay 4 en la estantería, pero 3 ya están prometidas.
            expect(res.status).toBe(409);
            expect(res.body.params).toEqual({ producto: "Ratón", disponible: 1, requerido: 2 });
            expect((await producto(raton.id)).stock).toBe(4);
            expect((await vender({ items: [{ productId: raton.id, quantity: 1 }] })).status).toBe(201);
        });

        it("el mismo producto en dos líneas suma: 3 y 2 sobre 4 no caben", async () => {
            const res = await vender({ items: [{ productId: raton.id, quantity: 3 }, { productId: raton.id, quantity: 2 }] });

            expect(res.status).toBe(409);
            expect(res.body.params).toMatchObject({ disponible: 4, requerido: 5 });
            await nadaSeHaMovido();
        });

        it("y si caben, son dos líneas y dos movimientos del mismo producto", async () => {
            const res = await vender({ items: [{ productId: raton.id, quantity: 3 }, { productId: raton.id, quantity: 1 }] });

            expect(res.status).toBe(201);
            expect((await producto(raton.id)).stock).toBe(0);
            expect((await prisma.stockMovement.findMany({ orderBy: { stockAfter: "desc" } })).map((m) => [m.delta, m.stockAfter])).toEqual([[-3, 1], [-1, 0]]);
        });

        it("un producto que no existe es 404 y no se vende el resto", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }, { productId: "00000000-0000-4000-8000-000000000000", quantity: 1 }] });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
            await nadaSeHaMovido();
        });

        it("un producto descatalogado no se vende: 409 con su código, y nada se mueve", async () => {
            await prisma.product.update({ where: { id: raton.id }, data: { isActive: false } });

            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }, { productId: raton.id, quantity: 1 }] });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("INACTIVE_PRODUCT_SALE");
            expect(res.body.params).toEqual({ producto: "Ratón" });
            await nadaSeHaMovido();
        });

        it("un cliente que no existe es 404 y no se vende", async () => {
            const res = await vender({ customerId: "00000000-0000-4000-8000-000000000000", items: [{ productId: teclado.id, quantity: 1 }] });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
            await nadaSeHaMovido();
        });

        it("dos ventas simultáneas de la última unidad dejan una hecha y otra rechazada", async () => {
            await ponerStock(raton.id, 1);
            const otra = getAuthCookie((await createUser({ email: "otra@example.com", role: "SELLER" })).id);

            const respuestas = await Promise.all([
                vender({ items: [{ productId: raton.id, quantity: 1 }] }),
                vender({ items: [{ productId: raton.id, quantity: 1 }] }, otra),
            ]);

            expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
            expect(respuestas.find((r) => r.status === 409)!.body.code).toBe("INSUFFICIENT_AVAILABLE_STOCK");
            expect((await producto(raton.id)).stock).toBe(0);
            expect(await prisma.saleOrder.count()).toBe(1);
            expect(await prisma.stockMovement.count()).toBe(1);
        });

        it("diez ventas a la vez de un producto con cuatro unidades: cuatro hechas, seis rechazadas, y los números sin repetir", async () => {
            const respuestas = await Promise.all(Array.from({ length: 10 }, () => vender({ items: [{ productId: raton.id, quantity: 1 }] })));

            expect(respuestas.filter((r) => r.status === 201)).toHaveLength(4);
            expect(respuestas.filter((r) => r.status === 409)).toHaveLength(6);
            expect((await producto(raton.id)).stock).toBe(0);
            const numeros = (await prisma.saleOrder.findMany({ orderBy: { number: "asc" } })).map((o) => o.number);
            expect(numeros).toEqual([1, 2, 3, 4]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que valida", () => {
        it.each([
            ["sin líneas", { items: [] }],
            ["sin `items`", {}],
            ["con cantidad 0", { items: [{ productId: "00000000-0000-4000-8000-000000000000", quantity: 0 }] }],
            ["con cantidad negativa", { items: [{ productId: "00000000-0000-4000-8000-000000000000", quantity: -1 }] }],
            ["con cantidad decimal", { items: [{ productId: "00000000-0000-4000-8000-000000000000", quantity: 1.5 }] }],
            ["con una cantidad que no cabe en un entero de la base", { items: [{ productId: "00000000-0000-4000-8000-000000000000", quantity: 3_000_000_000 }] }],
            ["con un producto que no es un UUID", { items: [{ productId: "teclado", quantity: 1 }] }],
            ["con un correo de cliente mal escrito", { customerEmail: "no-es-correo", items: [{ productId: "00000000-0000-4000-8000-000000000000", quantity: 1 }] }],
        ])("422 %s", async (_caso, cuerpo) => {
            const res = await vender(cuerpo);

            expect(res.status).toBe(422);
            expect(res.body.code).toBe("VALIDATION_ERROR");
            await nadaSeHaMovido();
        });

        it("422 con más líneas de las que admite", async () => {
            const res = await vender({ items: Array.from({ length: MAXIMO_DE_LINEAS_DE_MOSTRADOR + 1 }, () => ({ productId: teclado.id, quantity: 1 })) });

            expect(res.status).toBe(422);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el cliente, opcional", () => {
        it("sin cliente, la venta no es de nadie", async () => {
            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }] });

            expect(res.body.data).toMatchObject({ customerId: null, customerName: null, customerDocument: null });
        });

        it("con un cliente elegido, la venta copia su instantánea, documento incluido", async () => {
            const cliente = await prisma.customer.create({ data: { name: "Ana Soto", email: "ana@example.com", phone: "555", document: "001-1234567-8" } });

            const res = await vender({ customerId: cliente.id, items: [{ productId: teclado.id, quantity: 1 }] });

            expect(res.body.data).toMatchObject({
                customerId: cliente.id, customerName: "Ana Soto", customerEmail: "ana@example.com", customerPhone: "555", customerDocument: "001-1234567-8",
            });
        });

        it("con un correo nuevo, crea el cliente, como una orden", async () => {
            const res = await vender({ customerName: "Luis", customerEmail: "Luis@Example.com", customerDocument: "B-1", items: [{ productId: teclado.id, quantity: 1 }] });

            const cliente = await prisma.customer.findFirstOrThrow();
            expect(cliente).toMatchObject({ name: "Luis", email: "luis@example.com", document: "B-1" });
            expect(res.body.data.customerId).toBe(cliente.id);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el impuesto y el aviso de stock bajo", () => {
        it("congela la tasa vigente en cada línea y devuelve los tres importes", async () => {
            await prisma.appSetting.create({ data: { key: "taxRate", value: "18" } });

            const res = await vender({ items: [{ productId: teclado.id, quantity: 3 }, { productId: raton.id, quantity: 1 }] });

            // 150.00 al 18 % son 27.00; 25.50 son 4.59.
            expect(res.body.data).toMatchObject({ subtotal: "175.50", tax: "31.59", total: "207.09" });
            expect(res.body.data.items.map((i: { taxRate: number }) => i.taxRate)).toEqual([18, 18]);
        });

        it("avisa del stock bajo después de vender, y a quien no estaba", async () => {
            const administradora = await prisma.user.findFirstOrThrow({ where: { email: "admin@example.com" } });

            // 4 − 3 = 1, que es el mínimo del ratón; el teclado se queda en 9, muy por encima.
            await vender({ items: [{ productId: raton.id, quantity: 3 }, { productId: teclado.id, quantity: 1 }] });
            await esperarAlertasEnVuelo();

            const avisos = await prisma.notification.findMany();
            expect(avisos.map((a) => [a.userId, a.type, a.entityId])).toEqual([[administradora.id, "LOW_STOCK", raton.id]]);
        });

        it("una venta rechazada no avisa de nada", async () => {
            await vender({ items: [{ productId: raton.id, quantity: 3 }, { productId: teclado.id, quantity: 99 }] });
            await esperarAlertasEnVuelo();

            expect(await prisma.notification.count()).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que el vendedor no puede", () => {
        it("crear una orden pendiente es 403: fijaría un precio", async () => {
            const res = await request(app).post(VENTAS).set("Cookie", vendedor)
                .send({ items: [{ productId: teclado.id, productName: "Teclado", quantity: 1, unitPrice: 1 }] });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe("FORBIDDEN");
            expect(await prisma.saleOrder.count()).toBe(0);
        });

        it("cancelar una venta hecha es 403, la suya incluida, y el stock no vuelve", async () => {
            const { body } = await vender({ items: [{ productId: teclado.id, quantity: 2 }] });

            const res = await request(app).patch(`${VENTAS}/${body.data.id}`).set("Cookie", vendedor).send({ status: "CANCELLED" });

            expect(res.status).toBe(403);
            expect((await prisma.saleOrder.findUniqueOrThrow({ where: { id: body.data.id } })).status).toBe("SHIPPED");
            expect((await producto(teclado.id)).stock).toBe(8);
        });

        it("cambiar un precio es 403 y el precio no cambia", async () => {
            const res = await request(app).put(`/api/v1/products/${teclado.id}`).set("Cookie", vendedor).send({ price: 1 });

            expect(res.status).toBe(403);
            expect((await producto(teclado.id)).price.toString()).toBe("50");
        });

        it("enviar la orden pendiente de otro es 403: eso es del almacén", async () => {
            const pendiente = await request(app).post(VENTAS).set("Cookie", admin)
                .send({ items: [{ productId: teclado.id, productName: "Teclado", quantity: 1, unitPrice: 50 }] });

            const res = await request(app).post(`${VENTAS}/${pendiente.body.data.id}/ship`).set("Cookie", vendedor);

            expect(res.status).toBe(403);
            expect((await producto(teclado.id)).stock).toBe(10);
        });

        it("tampoco mueve stock a mano, ni borra una orden", async () => {
            const movimiento = await request(app).post(`/api/v1/products/${teclado.id}/movements`).set("Cookie", vendedor).send({ type: "OUT", quantity: 1, reason: "x" });
            const borrado = await request(app).delete(`${VENTAS}/00000000-0000-4000-8000-000000000000`).set("Cookie", vendedor);

            expect([movimiento.status, borrado.status]).toEqual([403, 403]);
            expect((await producto(teclado.id)).stock).toBe(10);
        });

        it.each(["/users", "/settings", "/audit-logs", "/sale-orders/export", "/purchase-orders/export"])("no ve GET %s", async (ruta) => {
            expect((await request(app).get(`/api/v1${ruta}`).set("Cookie", vendedor)).status).toBe(403);
        });

        it.each(["USER", "WAREHOUSE"] as const)("y un %s no vende en el mostrador", async (role) => {
            const cookie = getAuthCookie((await createUser({ email: `${role.toLowerCase()}@example.com`, role })).id);

            const res = await vender({ items: [{ productId: teclado.id, quantity: 1 }] }, cookie);

            expect(res.status).toBe(403);
            await nadaSeHaMovido();
        });

        it("sin sesión, 401", async () => {
            expect((await request(app).post(MOSTRADOR).send({ items: [{ productId: teclado.id, quantity: 1 }] })).status).toBe(401);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la matriz: SELLER lee lo que lee USER y solo añade el mostrador", () => {
        const rutas = Object.keys(PERMISOS) as RutaConPermiso[];

        it("el rol existe en el contrato", () => {
            expect(rolSchema.options).toContain("SELLER");
        });

        it("la única ruta que tiene y un USER no tiene es la venta de mostrador", () => {
            expect(rutas.filter((ruta) => puede("SELLER", ruta) && !puede("USER", ruta))).toEqual(["POST /sale-orders/counter"]);
        });

        it("y no le falta ninguna de las de un USER", () => {
            expect(rutas.filter((ruta) => puede("USER", ruta) && !puede("SELLER", ruta))).toEqual([]);
        });

        it("no escribe en nada más: de todo lo que no es GET, solo tiene el mostrador y sus propios avisos", () => {
            const escrituras = rutas.filter((ruta) => !ruta.startsWith("GET ") && puede("SELLER", ruta));

            expect(escrituras).toEqual(["POST /sale-orders/counter", "POST /notifications/read-all", "POST /notifications/:id/read"]);
        });

        it("el almacén no vende en el mostrador, ni el vendedor hace nada del almacén", () => {
            expect(puede("WAREHOUSE", "POST /sale-orders/counter")).toBe(false);
            expect(rutas.filter((ruta) => puede("SELLER", ruta) && puede("WAREHOUSE", ruta) && !puede("USER", ruta))).toEqual([]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el envío sigue siendo el de siempre: las dos rutas comparten la misma mitad", () => {
        it("enviar una orden pendiente hace lo mismo que el mostrador, con su propio concepto en el movimiento", async () => {
            const pendiente = await request(app).post(VENTAS).set("Cookie", admin)
                .send({ items: [{ productId: teclado.id, productName: "Teclado", quantity: 3, unitPrice: 45 }] });

            const res = await request(app).post(`${VENTAS}/${pendiente.body.data.id}/ship`).set("Cookie", admin);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("SHIPPED");
            const [movimiento] = await prisma.stockMovement.findMany();
            expect([movimiento!.type, movimiento!.delta, movimiento!.stockAfter, movimiento!.note]).toEqual(["OUT", -3, 7, "Orden de venta #000001"]);
            // El precio de una orden sí lo fija quien la crea: 45, no los 50 del catálogo.
            const linea = await prisma.saleOrderItem.findFirstOrThrow();
            expect([linea.unitPrice.toString(), linea.unitCost?.toString()]).toEqual(["45", "30.1234"]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la previsión del mostrador dice lo mismo que el servidor", () => {
        // `totalesPrevistos` está en el contrato para que la pantalla diga cuánto se va a cobrar
        // antes de registrar la venta. Es la misma regla que `totalesDeLinea`, escrita en
        // céntimos: aquí se comparan las dos.
        const PRECIOS = ["0.01", "0.05", "0.10", "0.33", "1.00", "1.15", "9.99", "19.99", "25.50", "1234.50", "99999.99"];
        const CANTIDADES = [1, 2, 3, 7, 13, 100];
        const TASAS = [0, 7.5, 10, 10.25, 16, 18, 21, 100];

        it("coincide en cada combinación de precio, cantidad y tasa de la rejilla", () => {
            const distintas: string[] = [];
            for (const tasa of TASAS) for (const precio of PRECIOS) for (const quantity of CANTIDADES) {
                const servidor = totalesDeLinea({ quantity, unitPrice: new Prisma.Decimal(precio), taxRate: new Prisma.Decimal(tasa) });
                const prevision = totalesPrevistos([{ quantity, unitPrice: precio }], tasa);
                const esperado = { subtotal: servidor.subtotal.toFixed(2), tax: servidor.tax.toFixed(2), total: servidor.total.toFixed(2) };
                if (JSON.stringify(prevision) !== JSON.stringify(esperado)) distintas.push(`${quantity} × ${precio} al ${tasa} %`);
            }

            expect(distintas).toEqual([]);
        });

        it("el medio céntimo va hacia arriba, y el impuesto se redondea por línea, no sobre el total", () => {
            // 0.05 al 10 % son 0.005: un céntimo.
            expect(totalesPrevistos([{ quantity: 1, unitPrice: 0.05 }], 10)).toEqual({ subtotal: "0.05", tax: "0.01", total: "0.06" });
            // Tres líneas de 0.05: tres céntimos de impuesto. Sobre el total serían 0.015 → dos.
            const linea = { quantity: 1, unitPrice: "0.05" };
            expect(totalesPrevistos([linea, linea, linea], 10)).toEqual({ subtotal: "0.15", tax: "0.03", total: "0.18" });
        });

        it("sin líneas o con la tasa a 0, no hay impuesto", () => {
            expect(totalesPrevistos([], 18)).toEqual({ subtotal: "0.00", tax: "0.00", total: "0.00" });
            expect(totalesPrevistos([{ quantity: 2, unitPrice: 25.5 }], 0)).toEqual({ subtotal: "51.00", tax: "0.00", total: "51.00" });
        });

        it("y coincide con lo que devuelve una venta de verdad", async () => {
            await prisma.appSetting.create({ data: { key: "taxRate", value: "7.5" } });
            const lineas = [{ productId: teclado.id, quantity: 3 }, { productId: raton.id, quantity: 3 }];

            const res = await vender({ items: lineas });

            const prevision = totalesPrevistos([{ quantity: 3, unitPrice: 50 }, { quantity: 3, unitPrice: "25.50" }], 7.5);
            expect({ subtotal: res.body.data.subtotal, tax: res.body.data.tax, total: res.body.data.total }).toEqual(prevision);
        });
    });
});
