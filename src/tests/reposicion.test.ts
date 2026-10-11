import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta, ALMACEN, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-05 — plazo de entrega del proveedor y sugerencias de reposición.
 *
 * La fórmula es `⌈salidas/30 × plazo + mínimo − disponible − pendiente⌉`, y cada uno de sus
 * cinco términos tiene aquí un test que lo mueve solo a él: si uno se lee de la tabla
 * equivocada —stock en vez de disponible, lo pedido en vez de lo que falta por llegar—, el
 * número sigue saliendo, parece razonable y está mal.
 */

const COMPRAS = "/api/v1/purchase-orders";
const SUGERENCIAS = `${COMPRAS}/suggestions`;
const DIA = 24 * 60 * 60 * 1000;

describe("Sugerencias de reposición (T5-05)", () => {
    let cookie: string;
    let cookieUser: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "repo_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "repo_user@example.com", role: "USER" });
        cookie = getAuthCookie(admin.id);
        cookieUser = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.costHistory.deleteMany();
        await prisma.purchaseOrderItem.deleteMany();
        await prisma.purchaseOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.supplier.deleteMany();
        await prisma.appSetting.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const proveedor = (name: string, leadTimeDays: number | null = 7) => prisma.supplier.create({ data: { name, leadTimeDays } });

    const producto = (
        name: string,
        datos: { stock: number; minStock: number; supplierId?: string | null; costPrice?: number; isActive?: boolean },
    ) =>
        crearProducto({
            data: {
                name,
                price: 50,
                stock: datos.stock,
                minStock: datos.minStock,
                supplierId: datos.supplierId ?? null,
                isActive: datos.isActive ?? true,
                ...(datos.costPrice !== undefined && { costPrice: datos.costPrice }),
            },
        });

    /** Salidas `OUT` hace `hace` días. El stock no se toca: la fórmula lee los movimientos. */
    const salidas = (productId: string, unidades: number, hace = 1) =>
        prisma.stockMovement.create({
            data: { productId, type: "OUT", delta: -unidades, stockAfter: 0, warehouseId: ALMACEN, warehouseStockAfter: 0, createdAt: new Date(Date.now() - hace * DIA) },
        });

    const listar = async (query = "") => {
        const res = await request(app).get(`${SUGERENCIAS}${query}`).set("Cookie", cookie);
        expect(res.status).toBe(200);
        return res.body.data as {
            data: Array<Record<string, unknown> & { productId: string; suggestedQuantity: number }>;
            meta: { total: number; page: number; limit: number; totalPages: number };
            days: number;
            defaultLeadTimeDays: number;
        };
    };

    const sugerenciaDe = async (productId: string) => (await listar("?limit=100")).data.find((s) => s.productId === productId);

    /** Una orden de compra directa en la base, con lo pedido y lo recibido de su única línea. */
    const ordenDeCompra = (datos: {
        productId: string; supplierId?: string | null; status: "PENDING" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
        quantity: number; receivedQuantity?: number; unitPrice?: number; createdAt?: Date;
    }) =>
        prisma.purchaseOrder.create({
            data: { warehouseId: ALMACEN,
                supplierId: datos.supplierId ?? null,
                status: datos.status,
                ...(datos.createdAt && { createdAt: datos.createdAt }),
                items: {
                    create: {
                        productId: datos.productId,
                        productName: "línea",
                        quantity: datos.quantity,
                        receivedQuantity: datos.receivedQuantity ?? 0,
                        unitPrice: datos.unitPrice ?? 5,
                    },
                },
            },
        });

    describe("El criterio", () => {
        it("velocidad 2/día, plazo 7, mínimo 10, 5 disponibles y nada pedido sugiere 19", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tornillo", { stock: 5, minStock: 10, supplierId: prov.id });
            await salidas(p.id, 60);

            const s = await sugerenciaDe(p.id);

            expect(s).toMatchObject({
                suggestedQuantity: 19,
                dailyVelocity: 2,
                unitsOut: 60,
                leadTimeDays: 7,
                leadTimeIsDefault: false,
                availableStock: 5,
                pendingReceipt: 0,
                supplier: { id: prov.id, name: "Norte" },
            });
        });

        it("con 19 ya pedidos en una orden abierta sugiere 0: el producto deja de aparecer", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tornillo", { stock: 5, minStock: 10, supplierId: prov.id });
            await salidas(p.id, 60);
            await ordenDeCompra({ productId: p.id, supplierId: prov.id, status: "PENDING", quantity: 19 });

            expect(await sugerenciaDe(p.id)).toBeUndefined();
        });

        it("generar las órdenes sugeridas deja la sugerencia en 0 sin intervención", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tornillo", { stock: 5, minStock: 10, supplierId: prov.id });
            await salidas(p.id, 60);

            const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie)
                .send({ items: [{ productId: p.id, quantity: 19, unitPrice: 3 }] });

            expect(res.status).toBe(201);
            expect(await sugerenciaDe(p.id)).toBeUndefined();
        });
    });

    describe("Cada término de la fórmula", () => {
        it("solo cuentan las salidas de los últimos 30 días", async () => {
            const prov = await proveedor("Norte", 10);
            const p = await producto("Arandela", { stock: 0, minStock: 0, supplierId: prov.id });
            await salidas(p.id, 30, 5);
            await salidas(p.id, 900, 31);

            // 30 salidas / 30 días × 10 días de plazo = 10. Con las de hace 31 días serían 310.
            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(10);
        });

        it("las entradas y los ajustes no cuentan como salida", async () => {
            const prov = await proveedor("Norte", 10);
            const p = await producto("Arandela", { stock: 0, minStock: 1, supplierId: prov.id });
            await prisma.stockMovement.createMany({
                data: [
                    { productId: p.id, type: "IN", delta: 300, stockAfter: 300, warehouseId: ALMACEN, warehouseStockAfter: 300 },
                    { productId: p.id, type: "ADJUSTMENT", delta: -300, stockAfter: 0, warehouseId: ALMACEN, warehouseStockAfter: 0 },
                ],
            });

            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(1);
        });

        it("resta el disponible, no el stock: lo comprometido en ventas pendientes ya tiene dueño", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tuerca", { stock: 10, minStock: 10, supplierId: prov.id });
            await prisma.saleOrder.create({
                data: { warehouseId: ALMACEN, number: await numeroDeVenta(), status: "PENDING", items: { create: { productId: p.id, productName: "Tuerca", quantity: 4, unitPrice: 50 } } },
            });
            // Una venta enviada ya salió del stock: no compromete nada más.
            await prisma.saleOrder.create({
                data: { warehouseId: ALMACEN, number: await numeroDeVenta(), status: "SHIPPED", items: { create: { productId: p.id, productName: "Tuerca", quantity: 99, unitPrice: 50 } } },
            });

            const s = await sugerenciaDe(p.id);

            // Mínimo 10 − disponible 6 = 4. Sobre el stock serían 0 y no aparecería.
            expect(s).toMatchObject({ committedStock: 4, availableStock: 6, suggestedQuantity: 4 });
        });

        it("lo pendiente de una orden a medias es lo que falta por llegar, no lo pedido", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tuerca", { stock: 0, minStock: 50, supplierId: prov.id });
            await ordenDeCompra({ productId: p.id, supplierId: prov.id, status: "PARTIALLY_RECEIVED", quantity: 30, receivedQuantity: 20 });

            // Faltan 10 por llegar: 50 − 0 − 10 = 40. Restando lo pedido saldrían 20.
            expect(await sugerenciaDe(p.id)).toMatchObject({ pendingReceipt: 10, suggestedQuantity: 40 });
        });

        it("las órdenes recibidas o canceladas no cuentan como pendientes", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tuerca", { stock: 0, minStock: 50, supplierId: prov.id });
            await ordenDeCompra({ productId: p.id, supplierId: prov.id, status: "RECEIVED", quantity: 30, receivedQuantity: 30 });
            await ordenDeCompra({ productId: p.id, supplierId: prov.id, status: "CANCELLED", quantity: 30 });

            expect(await sugerenciaDe(p.id)).toMatchObject({ pendingReceipt: 0, suggestedQuantity: 50 });
        });

        it("lo pedido a otro proveedor también cubre: lo que viene de camino no depende de quién lo trae", async () => {
            const norte = await proveedor("Norte", 7);
            const sur = await proveedor("Sur", 7);
            const p = await producto("Tuerca", { stock: 0, minStock: 50, supplierId: norte.id });
            await ordenDeCompra({ productId: p.id, supplierId: sur.id, status: "PENDING", quantity: 50 });

            expect(await sugerenciaDe(p.id)).toBeUndefined();
        });

        it("redondea hacia arriba sin pasar por coma flotante", async () => {
            // 31 salidas / 30 × 30 días + 0 − 20 = 11 exacto. En coma flotante, 31/30 × 30 da
            // 31.000000000000004 y el techo sube a 12: una unidad de más en cada orden.
            const prov = await proveedor("Norte", 30);
            const p = await producto("Remache", { stock: 20, minStock: 0, supplierId: prov.id });
            await salidas(p.id, 31);

            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(11);
        });

        it("redondea hacia arriba una necesidad fraccionaria", async () => {
            const prov = await proveedor("Norte", 1);
            const p = await producto("Remache", { stock: 0, minStock: 0, supplierId: prov.id });
            await salidas(p.id, 1);

            // 1/30 de unidad al día durante un día: hace falta una, no cero.
            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(1);
        });

        it("un stock negativo cuenta como déficit que cubrir", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Clavo", { stock: -3, minStock: 2, supplierId: prov.id });

            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(5);
        });
    });

    describe("Plazo de entrega", () => {
        it("sin plazo en el proveedor usa el de Configuración, 7 por defecto, y lo dice", async () => {
            const prov = await proveedor("Sin plazo", null);
            const p = await producto("Tornillo", { stock: 5, minStock: 10, supplierId: prov.id });
            await salidas(p.id, 60);

            const lista = await listar();
            const s = lista.data.find((f) => f.productId === p.id);

            expect(lista.defaultLeadTimeDays).toBe(7);
            expect(s).toMatchObject({ leadTimeDays: 7, leadTimeIsDefault: true, suggestedQuantity: 19 });
        });

        it("cambiar el ajuste cambia la sugerencia de los proveedores sin plazo, y solo de esos", async () => {
            const sinPlazo = await proveedor("Sin plazo", null);
            const conPlazo = await proveedor("Con plazo", 7);
            const a = await producto("A", { stock: 0, minStock: 0, supplierId: sinPlazo.id });
            const b = await producto("B", { stock: 0, minStock: 0, supplierId: conPlazo.id });
            await salidas(a.id, 30);
            await salidas(b.id, 30);

            const res = await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ defaultLeadTimeDays: 14 });
            expect(res.status).toBe(200);

            expect(await sugerenciaDe(a.id)).toMatchObject({ leadTimeDays: 14, suggestedQuantity: 14 });
            expect(await sugerenciaDe(b.id)).toMatchObject({ leadTimeDays: 7, suggestedQuantity: 7 });
        });

        it("un plazo de 0 días es un plazo, no un desconocido", async () => {
            const prov = await proveedor("En el día", 0);
            const p = await producto("A", { stock: 0, minStock: 3, supplierId: prov.id });
            await salidas(p.id, 300);

            expect(await sugerenciaDe(p.id)).toMatchObject({ leadTimeDays: 0, leadTimeIsDefault: false, suggestedQuantity: 3 });
        });

        it.each([[-1], [2.5], [366]])("el ajuste rechaza %p", async (valor) => {
            const res = await request(app).patch("/api/v1/settings").set("Cookie", cookie).send({ defaultLeadTimeDays: valor });
            expect(res.status).toBe(422);
        });

        it("el proveedor guarda su plazo, lo rechaza fuera de rango y lo borra con null", async () => {
            const creado = await request(app).post("/api/v1/suppliers").set("Cookie", cookie).send({ name: "Plazos", leadTimeDays: 12 });
            expect(creado.status).toBe(201);
            expect(creado.body.data.leadTimeDays).toBe(12);

            const id = creado.body.data.id as string;
            const malo = await request(app).put(`/api/v1/suppliers/${id}`).set("Cookie", cookie).send({ name: "Plazos", leadTimeDays: -2 });
            expect(malo.status).toBe(422);

            const borrado = await request(app).put(`/api/v1/suppliers/${id}`).set("Cookie", cookie).send({ name: "Plazos", leadTimeDays: null });
            expect(borrado.status).toBe(200);
            expect(borrado.body.data.leadTimeDays).toBeNull();
        });

        it("editar un proveedor sin mandar el plazo no lo borra", async () => {
            const prov = await proveedor("Plazos", 9);
            const res = await request(app).put(`/api/v1/suppliers/${prov.id}`).set("Cookie", cookie).send({ name: "Otro nombre" });

            expect(res.status).toBe(200);
            expect(res.body.data.leadTimeDays).toBe(9);
        });
    });

    describe("Precio propuesto", () => {
        it("el último pagado a ese proveedor, ignorando el de otros proveedores y el de órdenes sin recibir o canceladas", async () => {
            const norte = await proveedor("Norte", 7);
            const sur = await proveedor("Sur", 7);
            const p = await producto("Tornillo", { stock: 0, minStock: 10, supplierId: norte.id, costPrice: 4.5 });
            await ordenDeCompra({ productId: p.id, supplierId: norte.id, status: "RECEIVED", quantity: 1, receivedQuantity: 1, unitPrice: 3, createdAt: new Date(Date.now() - 20 * DIA) });
            await ordenDeCompra({ productId: p.id, supplierId: norte.id, status: "PARTIALLY_RECEIVED", quantity: 2, receivedQuantity: 1, unitPrice: 3.25, createdAt: new Date(Date.now() - 10 * DIA) });
            // Más recientes, pero no cuentan: otro proveedor, sin recibir o cancelada.
            await ordenDeCompra({ productId: p.id, supplierId: sur.id, status: "RECEIVED", quantity: 1, receivedQuantity: 1, unitPrice: 1 });
            await ordenDeCompra({ productId: p.id, supplierId: norte.id, status: "CANCELLED", quantity: 1, receivedQuantity: 1, unitPrice: 9 });

            // La parcial deja 1 pendiente: 10 − 0 − 1 = 9. El precio, el de la parcial.
            expect(await sugerenciaDe(p.id)).toMatchObject({ proposedUnitPrice: 3.25, priceSource: "LAST_PURCHASE", suggestedQuantity: 9 });
        });

        it("sin compras a ese proveedor, el coste medio redondeado a céntimos", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tornillo", { stock: 0, minStock: 10, supplierId: prov.id, costPrice: 4.0025 });

            expect(await sugerenciaDe(p.id)).toMatchObject({ proposedUnitPrice: 4, priceSource: "COST" });
        });

        it("sin compras ni coste, ninguno: nunca el precio de venta", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("Tornillo", { stock: 0, minStock: 10, supplierId: prov.id });

            expect(await sugerenciaDe(p.id)).toMatchObject({ proposedUnitPrice: null, priceSource: null });
        });
    });

    describe("Qué productos salen y en qué orden", () => {
        it("los productos sin proveedor salen, al final y con proveedor null", async () => {
            const zeta = await proveedor("Zeta", 7);
            const alfa = await proveedor("Alfa", 7);
            const huerfano = await producto("Aaa huérfano", { stock: 0, minStock: 1 });
            const deZeta = await producto("Bbb", { stock: 0, minStock: 1, supplierId: zeta.id });
            const deAlfa = await producto("Ccc", { stock: 0, minStock: 1, supplierId: alfa.id });

            const { data } = await listar();

            expect(data.map((s) => s.productId)).toEqual([deAlfa.id, deZeta.id, huerfano.id]);
            expect(data[2]!.supplier).toBeNull();
        });

        it("no salen los inactivos ni los que no necesitan reponer", async () => {
            const prov = await proveedor("Norte", 7);
            await producto("Inactivo", { stock: 0, minStock: 10, supplierId: prov.id, isActive: false });
            await producto("Cubierto", { stock: 10, minStock: 10, supplierId: prov.id });

            const { data, meta } = await listar();

            expect(data).toEqual([]);
            expect(meta.total).toBe(0);
        });

        it("pagina, y el total cuenta todas las sugerencias, no las de la página", async () => {
            const prov = await proveedor("Norte", 7);
            for (let i = 0; i < 5; i++) await producto(`P${i}`, { stock: 0, minStock: 1, supplierId: prov.id });

            const pagina2 = await listar("?limit=2&page=2");

            expect(pagina2.meta).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
            expect(pagina2.data.map((s) => s.productName)).toEqual(["P2", "P3"]);
        });

        it("un USER puede consultarlas", async () => {
            const res = await request(app).get(SUGERENCIAS).set("Cookie", cookieUser);
            expect(res.status).toBe(200);
        });
    });

    describe("Generar órdenes", () => {
        it("crea una orden PENDING por proveedor con la cantidad y el precio enviados, y la audita con su origen", async () => {
            const norte = await proveedor("Norte", 7);
            const sur = await proveedor("Sur", 7);
            const a = await producto("A", { stock: 0, minStock: 10, supplierId: norte.id });
            const b = await producto("B", { stock: 0, minStock: 10, supplierId: norte.id });
            const c = await producto("C", { stock: 0, minStock: 10, supplierId: sur.id });

            const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie).send({
                items: [
                    { productId: c.id, quantity: 7, unitPrice: 1.5 },
                    { productId: a.id, quantity: 12, unitPrice: 2 },
                    { productId: b.id, quantity: 3, unitPrice: 4.25 },
                ],
            });

            expect(res.status).toBe(201);
            const ordenes = res.body.data as Array<{ id: string; status: string; supplier: { name: string }; items: Array<{ productId: string; quantity: number; unitPrice: string; productName: string }> }>;
            expect(ordenes.map((o) => [o.supplier.name, o.status, o.items.length])).toEqual([["Norte", "PENDING", 2], ["Sur", "PENDING", 1]]);
            expect(ordenes[1]!.items[0]).toMatchObject({ productId: c.id, productName: "C", quantity: 7, unitPrice: "1.5" });

            // Un borrador no mueve stock.
            expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).stock).toBe(0);

            const auditoria = await prisma.auditLog.findMany({ where: { entity: "PurchaseOrder", action: "CREATE" } });
            expect(auditoria).toHaveLength(2);
            expect(auditoria.every((r) => (r.details as { origen?: string }).origen === "REORDER_SUGGESTION")).toBe(true);
        });

        it("un producto sin proveedor rechaza el lote entero con 400 y no crea ninguna orden", async () => {
            const prov = await proveedor("Norte", 7);
            const conProv = await producto("Con", { stock: 0, minStock: 1, supplierId: prov.id });
            const sinProv = await producto("Sin", { stock: 0, minStock: 1 });

            const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie).send({
                items: [
                    { productId: conProv.id, quantity: 1, unitPrice: 1 },
                    { productId: sinProv.id, quantity: 1, unitPrice: 1 },
                ],
            });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: "PRODUCT_WITHOUT_SUPPLIER", params: { producto: "Sin" } });
            expect(await prisma.purchaseOrder.count()).toBe(0);
        });

        it("un producto inexistente o inactivo es 404", async () => {
            const prov = await proveedor("Norte", 7);
            const inactivo = await producto("Inactivo", { stock: 0, minStock: 1, supplierId: prov.id, isActive: false });

            for (const productId of [inactivo.id, "00000000-0000-4000-8000-000000000000"]) {
                const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie).send({ items: [{ productId, quantity: 1, unitPrice: 1 }] });
                expect(res.status).toBe(404);
                expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
            }
        });

        it("rechaza con 422 el mismo producto dos veces, un precio ausente o una cantidad no entera", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("A", { stock: 0, minStock: 1, supplierId: prov.id });

            const cuerpos = [
                { items: [{ productId: p.id, quantity: 1, unitPrice: 1 }, { productId: p.id, quantity: 2, unitPrice: 1 }] },
                { items: [{ productId: p.id, quantity: 1 }] },
                { items: [{ productId: p.id, quantity: 1.5, unitPrice: 1 }] },
                { items: [] },
            ];
            for (const cuerpo of cuerpos) {
                const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie).send(cuerpo);
                expect(res.status).toBe(422);
            }
            expect(await prisma.purchaseOrder.count()).toBe(0);
        });

        it("un USER no puede generar: 403", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("A", { stock: 0, minStock: 1, supplierId: prov.id });

            const res = await request(app).post(SUGERENCIAS).set("Cookie", cookieUser).send({ items: [{ productId: p.id, quantity: 1, unitPrice: 1 }] });

            expect(res.status).toBe(403);
        });

        it("los borradores generados se cancelan como cualquier orden", async () => {
            const prov = await proveedor("Norte", 7);
            const p = await producto("A", { stock: 0, minStock: 5, supplierId: prov.id });
            const res = await request(app).post(SUGERENCIAS).set("Cookie", cookie).send({ items: [{ productId: p.id, quantity: 5, unitPrice: 1 }] });

            const cancelada = await request(app).patch(`${COMPRAS}/${res.body.data[0].id}`).set("Cookie", cookie).send({ status: "CANCELLED" });

            expect(cancelada.status).toBe(200);
            // Cancelado el borrador, la necesidad vuelve a aparecer.
            expect((await sugerenciaDe(p.id))?.suggestedQuantity).toBe(5);
        });
    });
});
