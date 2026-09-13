import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-02 — valor del inventario a coste y margen realizado.
 *
 * Lo que se vigila son las dos formas de dar un número que parece correcto y no lo es:
 *
 * - sumar como **coste cero** lo que no tiene coste, que infla el margen hasta el 100 %;
 * - calcular el margen de una venta pasada con el coste **actual** del producto, en vez del
 *   que tenía cuando se envió.
 */

const REPORTES = "/api/v1/reports";
const VENTAS = "/api/v1/sale-orders";

describe("Valor a coste y margen realizado (T5-02)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "margen_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.costHistory.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const resumen = async () => {
        const res = await request(app).get(REPORTES).set("Cookie", cookie);
        expect(res.status).toBe(200);
        return res.body.data;
    };

    /** Crea una venta por la API y la envía, que es donde se congela el coste. */
    async function venderYEnviar(items: Array<{ productId?: string; productName: string; quantity: number; unitPrice: number }>) {
        const creada = await request(app).post(VENTAS).set("Cookie", cookie).send({ customerName: "Cliente", items });
        expect(creada.status).toBe(201);
        const id = creada.body.data.id as string;
        const enviada = await request(app).patch(`${VENTAS}/${id}`).set("Cookie", cookie).send({ status: "SHIPPED" });
        expect(enviada.status).toBe(200);
        return id;
    }

    describe("Valor del inventario", () => {
        it("da el valor a coste y el margen potencial solo sobre los productos con coste", async () => {
            await prisma.product.create({ data: { name: "Con coste", price: 10, stock: 5, costPrice: 6 } });
            await prisma.product.create({ data: { name: "Sin coste", price: 100, stock: 2 } });

            const { totals } = await resumen();

            expect(totals.inventoryValue).toBe(250); // 10×5 + 100×2, a precio de venta
            expect(totals.inventoryCostValue).toBe(30); // solo 6×5
            // (10 − 6) × 5. Si se restara el coste de uno al precio de los dos saldría 220.
            expect(totals.potentialMargin).toBe(20);
            expect(totals.productsWithoutCost).toBe(1);
        });

        it("un producto sin coste y sin stock no cuenta como «sin coste»: no le falta nada", async () => {
            await prisma.product.create({ data: { name: "Agotado sin coste", price: 50, stock: 0 } });

            expect((await resumen()).totals.productsWithoutCost).toBe(0);
        });

        it("los inactivos no cuentan en ninguna de las cifras nuevas", async () => {
            await prisma.product.create({ data: { name: "Inactivo", price: 10, stock: 9, costPrice: 1, isActive: false } });
            await prisma.product.create({ data: { name: "Inactivo sin coste", price: 10, stock: 9, isActive: false } });

            const { totals } = await resumen();

            expect(totals.inventoryCostValue).toBe(0);
            expect(totals.potentialMargin).toBe(0);
            expect(totals.productsWithoutCost).toBe(0);
        });
    });

    describe("Congelar el coste al enviar", () => {
        it("el envío guarda el coste del momento y la fecha de envío", async () => {
            const p = await prisma.product.create({ data: { name: "Teclado", price: 30, stock: 10, costPrice: 18.5 } });

            const id = await venderYEnviar([{ productId: p.id, productName: "Teclado", quantity: 2, unitPrice: 30 }]);

            const orden = await prisma.saleOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
            expect(orden.shippedAt).not.toBeNull();
            expect(orden.items[0]!.unitCost?.toString()).toBe("18.5");
        });

        it("una venta pendiente no congela nada: el coste se fija al enviar, no al crear", async () => {
            const p = await prisma.product.create({ data: { name: "Ratón", price: 15, stock: 10, costPrice: 7 } });

            const creada = await request(app)
                .post(VENTAS)
                .set("Cookie", cookie)
                .send({ items: [{ productId: p.id, productName: "Ratón", quantity: 1, unitPrice: 15 }] });

            const orden = await prisma.saleOrder.findUniqueOrThrow({ where: { id: creada.body.data.id }, include: { items: true } });
            expect(orden.shippedAt).toBeNull();
            expect(orden.items[0]!.unitCost).toBeNull();
        });

        it("el criterio: una venta enviada conserva su margen aunque después cambie el coste", async () => {
            const p = await prisma.product.create({ data: { name: "Monitor", price: 200, stock: 10, costPrice: 120 } });
            await venderYEnviar([{ productId: p.id, productName: "Monitor", quantity: 3, unitPrice: 200 }]);

            const antes = (await resumen()).margin;
            expect(antes).toMatchObject({ revenue: 600, cost: 360, margin: 240, marginPercent: 40 });

            await prisma.product.update({ where: { id: p.id }, data: { costPrice: 190 } });

            // Con el coste actual el margen caería a 30. Tiene que seguir en 240.
            expect((await resumen()).margin).toMatchObject({ revenue: 600, cost: 360, margin: 240 });
        });
    });

    describe("Margen realizado", () => {
        it("lo vendido sin coste no suma como coste cero: queda fuera y se informa aparte", async () => {
            const conCoste = await prisma.product.create({ data: { name: "Con coste", price: 50, stock: 10, costPrice: 30 } });
            const sinCoste = await prisma.product.create({ data: { name: "Sin coste", price: 80, stock: 10 } });

            await venderYEnviar([
                { productId: conCoste.id, productName: "Con coste", quantity: 1, unitPrice: 50 },
                { productId: sinCoste.id, productName: "Sin coste", quantity: 1, unitPrice: 80 },
                { productName: "Escrito a mano", quantity: 2, unitPrice: 10 },
            ]);

            const { margin } = await resumen();

            // Sumando el sin coste como cero: ventas 150, margen 120, un 80 %.
            expect(margin).toMatchObject({ revenue: 50, cost: 30, margin: 20, marginPercent: 40, revenueWithoutCost: 100 });
            expect(margin.topProducts.map((p: { name: string }) => p.name)).toEqual(["Con coste"]);
        });

        it("una venta enviada y cancelada después no cuenta", async () => {
            const p = await prisma.product.create({ data: { name: "Hub", price: 40, stock: 10, costPrice: 25 } });
            const id = await venderYEnviar([{ productId: p.id, productName: "Hub", quantity: 2, unitPrice: 40 }]);

            await request(app).patch(`${VENTAS}/${id}`).set("Cookie", cookie).send({ status: "CANCELLED" });

            const { margin } = await resumen();
            expect(margin).toMatchObject({ revenue: 0, cost: 0, margin: 0, marginPercent: null, byCategory: [], topProducts: [] });
        });

        it("cuenta por fecha de envío y deja fuera lo enviado hace más de 30 días", async () => {
            const p = await prisma.product.create({ data: { name: "Cable", price: 10, stock: 50, costPrice: 4 } });
            const reciente = await venderYEnviar([{ productId: p.id, productName: "Cable", quantity: 1, unitPrice: 10 }]);
            const antigua = await venderYEnviar([{ productId: p.id, productName: "Cable", quantity: 5, unitPrice: 10 }]);

            // Creada hace poco pero enviada hace 40 días: manda la fecha de envío, no la de alta.
            const hace40 = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
            await prisma.saleOrder.update({ where: { id: antigua }, data: { shippedAt: hace40 } });

            const { margin } = await resumen();
            expect(margin.days).toBe(30);
            expect(margin).toMatchObject({ revenue: 10, cost: 4, margin: 6 });
            expect(reciente).toBeDefined();
        });

        it("desglosa por categoría actual, sin categoría como null, de más a menos margen", async () => {
            const audio = await prisma.category.create({ data: { name: "Audio" } });
            const auriculares = await prisma.product.create({ data: { name: "Auriculares", price: 100, stock: 10, costPrice: 40, categoryId: audio.id } });
            const suelto = await prisma.product.create({ data: { name: "Suelto", price: 20, stock: 10, costPrice: 15 } });

            await venderYEnviar([
                { productId: auriculares.id, productName: "Auriculares", quantity: 1, unitPrice: 100 },
                { productId: suelto.id, productName: "Suelto", quantity: 2, unitPrice: 20 },
            ]);

            const { margin } = await resumen();
            expect(margin.byCategory).toEqual([
                { name: "Audio", revenue: 100, cost: 40, margin: 60, marginPercent: 60 },
                // null y no «Sin categoría»: ese literal llegaría en español a una interfaz en inglés.
                { name: null, revenue: 40, cost: 30, margin: 10, marginPercent: 25 },
            ]);
        });

        it("el top de productos ordena por margen en importe, no en porcentaje, y admite margen negativo", async () => {
            const grande = await prisma.product.create({ data: { name: "Poco %, mucho importe", price: 1000, stock: 10, costPrice: 900 } });
            const pequeno = await prisma.product.create({ data: { name: "Mucho %, poco importe", price: 10, stock: 10, costPrice: 1 } });
            const perdida = await prisma.product.create({ data: { name: "Con pérdida", price: 10, stock: 10, costPrice: 12 } });

            await venderYEnviar([
                { productId: pequeno.id, productName: "Mucho %, poco importe", quantity: 1, unitPrice: 10 },
                { productId: grande.id, productName: "Poco %, mucho importe", quantity: 1, unitPrice: 1000 },
                { productId: perdida.id, productName: "Con pérdida", quantity: 1, unitPrice: 10 },
            ]);

            const { margin } = await resumen();
            expect(margin.topProducts.map((p: { name: string; margin: number }) => [p.name, p.margin])).toEqual([
                ["Poco %, mucho importe", 100],
                ["Mucho %, poco importe", 9],
                ["Con pérdida", -2],
            ]);
            expect(margin.topProducts[2].marginPercent).toBe(-20);
        });

        it("agrupa por producto las ventas de varias órdenes y cuenta las unidades", async () => {
            const p = await prisma.product.create({ data: { name: "Batería", price: 25, stock: 20, costPrice: 10 } });
            await venderYEnviar([{ productId: p.id, productName: "Batería", quantity: 2, unitPrice: 25 }]);
            await venderYEnviar([{ productId: p.id, productName: "Batería", quantity: 3, unitPrice: 20 }]);

            const [fila] = (await resumen()).margin.topProducts;
            expect(fila).toEqual({ productId: p.id, name: "Batería", units: 5, revenue: 110, cost: 50, margin: 60, marginPercent: 54.5 });
        });

        it("el PDF se genera con la sección de margen", async () => {
            const p = await prisma.product.create({ data: { name: "Tablet", price: 300, stock: 5, costPrice: 210 } });
            await venderYEnviar([{ productId: p.id, productName: "Tablet", quantity: 1, unitPrice: 300 }]);

            const res = await request(app)
                .get(`${REPORTES}?format=pdf`)
                .set("Cookie", cookie)
                .buffer(true)
                .parse((r, done) => {
                    const trozos: Buffer[] = [];
                    r.on("data", (t: Buffer) => trozos.push(t));
                    r.on("end", () => done(null, Buffer.concat(trozos)));
                });

            expect(res.status).toBe(200);
            expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
        });
    });
});
