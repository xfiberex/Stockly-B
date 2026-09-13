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
 * T5-03 — stock comprometido y disponible.
 *
 * El defecto: una venta pendiente no descontaba nada, así que con 5 unidades se aceptaban dos
 * ventas de 5 y la segunda fallaba **al enviarla**, cuando ya estaba prometida. La decisión
 * fue bloquear al crear, así que lo que se prueba es la frontera exacta —igual pasa, uno más
 * no— y lo que cuenta y no cuenta como comprometido.
 */

const VENTAS = "/api/v1/sale-orders";
const PRODUCTOS = "/api/v1/products";

describe("Stock comprometido y disponible (T5-03)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "disp_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterEach(async () => {
        await prisma.saleOrderItem.deleteMany();
        await prisma.saleOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const producto = (name: string, stock: number) => prisma.product.create({ data: { name, price: 10, stock } });

    const vender = (items: Array<{ productId?: string; productName: string; quantity: number }>) =>
        request(app)
            .post(VENTAS)
            .set("Cookie", cookie)
            .send({ items: items.map((i) => ({ ...i, unitPrice: 10 })) });

    const disponibleDe = async (id: string) => {
        const res = await request(app).get(`${PRODUCTOS}/${id}`).set("Cookie", cookie);
        expect(res.status).toBe(200);
        return { comprometido: res.body.data.committedStock, disponible: res.body.data.availableStock };
    };

    describe("Crear una venta", () => {
        it("el criterio: con 5 en stock y una pendiente de 5, otra de 1 se rechaza con 409", async () => {
            const p = await producto("Teclado", 5);

            expect((await vender([{ productId: p.id, productName: "Teclado", quantity: 5 }])).status).toBe(201);
            expect(await disponibleDe(p.id)).toEqual({ comprometido: 5, disponible: 0 });

            const res = await vender([{ productId: p.id, productName: "Teclado", quantity: 1 }]);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("INSUFFICIENT_AVAILABLE_STOCK");
            expect(res.body.params).toEqual({ producto: "Teclado", disponible: 0, requerido: 1 });
            // No se crea nada: la segunda orden no existe a medias.
            expect(await prisma.saleOrder.count()).toBe(1);
        });

        it("pedir exactamente lo disponible sí se puede", async () => {
            const p = await producto("Ratón", 4);
            await vender([{ productId: p.id, productName: "Ratón", quantity: 1 }]);

            expect((await vender([{ productId: p.id, productName: "Ratón", quantity: 3 }])).status).toBe(201);
        });

        it("el mismo producto en varias líneas suma", async () => {
            const p = await producto("Cable", 5);

            const res = await vender([
                { productId: p.id, productName: "Cable", quantity: 3 },
                { productId: p.id, productName: "Cable", quantity: 3 },
            ]);

            // Cada línea cabe sola en 5; juntas son 6.
            expect(res.status).toBe(409);
            expect(res.body.params.requerido).toBe(6);
        });

        it("si falla un producto no se crea la venta, aunque los demás quepan", async () => {
            const sobra = await producto("Sobra", 100);
            const falta = await producto("Falta", 1);

            const res = await vender([
                { productId: sobra.id, productName: "Sobra", quantity: 1 },
                { productId: falta.id, productName: "Falta", quantity: 2 },
            ]);

            expect(res.status).toBe(409);
            expect(res.body.params.producto).toBe("Falta");
            expect(await prisma.saleOrder.count()).toBe(0);
        });

        it("los ítems escritos a mano no tienen stock que comprobar", async () => {
            expect((await vender([{ productName: "Servicio de instalación", quantity: 50 }])).status).toBe(201);
        });

        it("404 si un productId no existe, en vez de un error de clave foránea", async () => {
            const res = await vender([{ productId: "00000000-0000-0000-0000-000000000000", productName: "Fantasma", quantity: 1 }]);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
        });

        it("una venta que se cruza con otra aún sin confirmar espera a verla, y no vende dos veces", async () => {
            const p = await producto("Monitor", 5);

            // **Un `Promise.all` de dos peticiones no servía**, y se comprobó quitando el bloqueo:
            // el test seguía en verde, porque las dos no llegaban a solaparse en la base. Aquí la
            // carrera se fuerza. Una transacción del propio test bloquea la fila y crea una
            // venta pendiente de 5 **sin confirmarla**; mientras tanto llega la petición.
            //  - Con el `FOR UPDATE` del servicio, la petición espera, lee el 5 ya confirmado → 409.
            //  - Sin él, lee el comprometido anterior (0), crea su venta → 201 y dos ventas de 5.
            let soltar!: () => void;
            const retenida = new Promise<void>((r) => (soltar = r));
            const otraVenta = prisma.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT id FROM products WHERE id = ${p.id} FOR UPDATE`;
                    await tx.saleOrder.create({
                        data: { items: { create: [{ productId: p.id, productName: "Monitor", quantity: 5, unitPrice: 10 }] } },
                    });
                    await retenida;
                },
                { timeout: 15_000 },
            );
            const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

            await esperar(300); // la otra transacción ya tiene la fila
            const peticion = vender([{ productId: p.id, productName: "Monitor", quantity: 5 }]).then((r) => r);
            await esperar(500); // la petición ya está dentro de su transacción
            soltar();
            await otraVenta;

            const res = await peticion;
            expect(res.status).toBe(409);
            expect(await prisma.saleOrder.count()).toBe(1);
        });
    });

    describe("Qué cuenta como comprometido", () => {
        it("enviar la venta libera el comprometido y descuenta el stock: el disponible no cambia", async () => {
            const p = await producto("Hub", 10);
            const venta = await vender([{ productId: p.id, productName: "Hub", quantity: 4 }]);
            expect(await disponibleDe(p.id)).toEqual({ comprometido: 4, disponible: 6 });

            await request(app).patch(`${VENTAS}/${venta.body.data.id}`).set("Cookie", cookie).send({ status: "SHIPPED" });

            expect(await disponibleDe(p.id)).toEqual({ comprometido: 0, disponible: 6 });
        });

        it("cancelar una venta pendiente libera el comprometido", async () => {
            const p = await producto("Webcam", 3);
            const venta = await vender([{ productId: p.id, productName: "Webcam", quantity: 3 }]);

            await request(app).patch(`${VENTAS}/${venta.body.data.id}`).set("Cookie", cookie).send({ status: "CANCELLED" });

            expect(await disponibleDe(p.id)).toEqual({ comprometido: 0, disponible: 3 });
            expect((await vender([{ productId: p.id, productName: "Webcam", quantity: 3 }])).status).toBe(201);
        });

        it("borrar una venta pendiente también lo libera", async () => {
            const p = await producto("Altavoz", 2);
            const venta = await vender([{ productId: p.id, productName: "Altavoz", quantity: 2 }]);

            await request(app).delete(`${VENTAS}/${venta.body.data.id}`).set("Cookie", cookie);

            expect(await disponibleDe(p.id)).toEqual({ comprometido: 0, disponible: 2 });
        });

        it("el listado trae comprometido y disponible de cada producto de la página", async () => {
            const a = await producto("T503-A", 8);
            const b = await producto("T503-B", 8);
            await vender([{ productId: a.id, productName: "T503-A", quantity: 3 }]);

            const res = await request(app).get(`${PRODUCTOS}?search=T503-`).set("Cookie", cookie);
            const porNombre = Object.fromEntries(
                res.body.data.data.map((p: { name: string; committedStock: number; availableStock: number }) => [p.name, [p.committedStock, p.availableStock]]),
            );

            expect(porNombre).toEqual({ "T503-A": [3, 5], "T503-B": [0, 8] });
            expect(b).toBeDefined();
        });

        it("con datos anteriores a la tarea, el disponible negativo se enseña tal cual", async () => {
            const p = await producto("Sobrevendido", 2);
            // Así pudo quedar antes de T5-03: una pendiente mayor que el stock, escrita directamente.
            await prisma.saleOrder.create({
                data: { items: { create: [{ productId: p.id, productName: "Sobrevendido", quantity: 5, unitPrice: 10 }] } },
            });

            expect(await disponibleDe(p.id)).toEqual({ comprometido: 5, disponible: -3 });
            // Y el error de una venta nueva no dice «disponible: −3», que no se entiende.
            const res = await vender([{ productId: p.id, productName: "Sobrevendido", quantity: 1 }]);
            expect(res.body.params.disponible).toBe(0);
        });
    });

    describe("Rotación", () => {
        it("los días hasta agotarse se cuentan sobre el disponible, no sobre el stock", async () => {
            const p = await producto("Rota", 30);
            // 30 salidas en 30 días: 1 al día.
            await prisma.stockMovement.create({ data: { productId: p.id, type: "OUT", delta: -30, stockAfter: 30 } });
            await vender([{ productId: p.id, productName: "Rota", quantity: 20 }]);

            const res = await request(app).get("/api/v1/reports").set("Cookie", cookie);
            const fila = res.body.data.stockMetrics.find((m: { productId: string }) => m.productId === p.id);

            // Con el stock serían 30 días; lo que queda sin dueño da para 10.
            expect(fila).toMatchObject({ currentStock: 30, availableStock: 10, daysToStockout: 10, reorderSoon: true });
        });
    });
});
