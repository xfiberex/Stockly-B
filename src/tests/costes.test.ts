import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { costeMedioTrasRecepcion, mismoCoste } from "@/shared/lib/costeMedio";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn(),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

/**
 * T5-01 — coste del producto y coste medio ponderado.
 *
 * Tres bloques: la función pura, la recepción de compras (que es donde el coste cambia solo)
 * y la edición manual con su histórico. Los casos límite de la ficha —sin coste previo,
 * stock a cero o negativo, ítems sin producto— tienen cada uno su test.
 */

const COMPRAS = "/api/v1/purchase-orders";
const PRODUCTOS = "/api/v1/products";

describe("costeMedioTrasRecepcion (T5-01)", () => {
    it("el criterio de la ficha: 10 a 3 + 10 a 5 → 4.00", () => {
        expect(costeMedioTrasRecepcion(10, "3", 10, "5").toString()).toBe("4");
    });

    it("sin coste previo, la recepción fija el coste: no promedia con cero", () => {
        expect(costeMedioTrasRecepcion(50, null, 10, "7.25").toString()).toBe("7.25");
    });

    it("con stock a cero el coste anterior no pesa", () => {
        expect(costeMedioTrasRecepcion(0, "100", 5, "8").toString()).toBe("8");
    });

    it("con stock negativo tampoco: un peso negativo daría una media absurda", () => {
        // 3 × 10 + (−2) × 100 = −170 sobre 1 unidad: sin la guarda saldría −170.
        expect(costeMedioTrasRecepcion(-2, "100", 3, "10").toString()).toBe("10");
    });

    it("redondea una vez al final, a cuatro decimales", () => {
        // (3 × 1 + 1 × 1.01) / 4 = 1.0025 — con dos decimales se perdería.
        expect(costeMedioTrasRecepcion(3, "1", 1, "1.01").toString()).toBe("1.0025");
        // 1 × 1 + 2 × 2 = 5 / 3 = 1.66666… → 1.6667
        expect(costeMedioTrasRecepcion(1, "1", 2, "2").toString()).toBe("1.6667");
    });

    it("mismoCoste compara a los decimales de la columna y trata null aparte", () => {
        expect(mismoCoste("4.0000", 4)).toBe(true);
        expect(mismoCoste("4.00001", "4")).toBe(true);
        expect(mismoCoste("4.0001", "4")).toBe(false);
        expect(mismoCoste(null, null)).toBe(true);
        expect(mismoCoste(null, 0)).toBe(false);
    });
});

describe("Coste medio en la API (T5-01)", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "coste_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "coste_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.costHistory.deleteMany();
        await prisma.purchaseOrderItem.deleteMany();
        await prisma.purchaseOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.priceHistory.deleteMany();
        await prisma.product.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    /** Crea una orden con los ítems dados y la marca recibida. Devuelve su id. */
    async function recibir(items: Array<{ productId?: string; productName: string; quantity: number; unitPrice: number }>) {
        const creada = await request(app).post(COMPRAS).set("Cookie", adminCookie).send({ items });
        expect(creada.status).toBe(201);
        const id = creada.body.data.id as string;
        const recibida = await request(app).patch(`${COMPRAS}/${id}`).set("Cookie", adminCookie).send({ status: "RECEIVED" });
        expect(recibida.status).toBe(200);
        return id;
    }

    const costeDe = async (id: string) =>
        (await prisma.product.findUniqueOrThrow({ where: { id } })).costPrice?.toString() ?? null;

    describe("Recepción de compras", () => {
        it("recibir 10 a 5 sobre 10 que costaron 3 deja el coste en 4, con su fila de histórico", async () => {
            const producto = await prisma.product.create({ data: { name: "Monitor", price: 20, stock: 10, costPrice: 3 } });

            const ordenId = await recibir([{ productId: producto.id, productName: "Monitor", quantity: 10, unitPrice: 5 }]);

            const despues = await prisma.product.findUniqueOrThrow({ where: { id: producto.id } });
            expect(despues.stock).toBe(20);
            expect(despues.costPrice?.toString()).toBe("4");

            const historial = await prisma.costHistory.findMany({ where: { productId: producto.id } });
            expect(historial).toHaveLength(1);
            expect(historial[0]!.oldCost?.toString()).toBe("3");
            expect(historial[0]!.newCost?.toString()).toBe("4");
            expect(historial[0]!.source).toBe("PURCHASE_RECEIPT");
            expect(historial[0]!.purchaseOrderId).toBe(ordenId);
        });

        it("un producto sin coste lo toma de su primera recepción, aunque ya tuviera stock", async () => {
            const producto = await prisma.product.create({ data: { name: "Cable", price: 9, stock: 40 } });
            expect(await costeDe(producto.id)).toBeNull();

            await recibir([{ productId: producto.id, productName: "Cable", quantity: 10, unitPrice: 2.5 }]);

            expect(await costeDe(producto.id)).toBe("2.5");
            const [fila] = await prisma.costHistory.findMany({ where: { productId: producto.id } });
            expect(fila!.oldCost).toBeNull();
        });

        it("con el stock a cero, la recepción fija el coste sin arrastrar el anterior", async () => {
            const producto = await prisma.product.create({ data: { name: "Hub", price: 30, stock: 0, costPrice: 100 } });

            await recibir([{ productId: producto.id, productName: "Hub", quantity: 4, unitPrice: 12 }]);

            expect(await costeDe(producto.id)).toBe("12");
        });

        it("el mismo producto dos veces en una orden promedia en orden, línea a línea", async () => {
            const producto = await prisma.product.create({ data: { name: "Disco", price: 80, stock: 0 } });

            await recibir([
                { productId: producto.id, productName: "Disco", quantity: 10, unitPrice: 10 },
                { productId: producto.id, productName: "Disco", quantity: 10, unitPrice: 20 },
            ]);

            // Primera línea: fija 10. Segunda: (10 × 10 + 10 × 20) / 20 = 15.
            expect(await costeDe(producto.id)).toBe("15");
            expect(await prisma.costHistory.count({ where: { productId: producto.id } })).toBe(2);
        });

        it("si la media no cambia, no se escribe histórico", async () => {
            const producto = await prisma.product.create({ data: { name: "Funda", price: 15, stock: 5, costPrice: 6 } });

            await recibir([{ productId: producto.id, productName: "Funda", quantity: 5, unitPrice: 6 }]);

            expect(await costeDe(producto.id)).toBe("6");
            expect(await prisma.costHistory.count()).toBe(0);
        });

        it("un ítem escrito a mano, sin producto, no toca ningún coste", async () => {
            const producto = await prisma.product.create({ data: { name: "Lámpara", price: 25, stock: 3, costPrice: 10 } });

            await recibir([{ productName: "Algo sin catálogo", quantity: 7, unitPrice: 99 }]);

            expect(await costeDe(producto.id)).toBe("10");
            expect(await prisma.costHistory.count()).toBe(0);
        });

        it("cancelar una orden recibida retira el stock pero deja el coste como está (decisión de T5-01)", async () => {
            const producto = await prisma.product.create({ data: { name: "Webcam", price: 50, stock: 10, costPrice: 3 } });
            const ordenId = await recibir([{ productId: producto.id, productName: "Webcam", quantity: 10, unitPrice: 5 }]);
            expect(await costeDe(producto.id)).toBe("4");

            const cancelada = await request(app).patch(`${COMPRAS}/${ordenId}`).set("Cookie", adminCookie).send({ status: "CANCELLED" });
            expect(cancelada.status).toBe(200);

            const despues = await prisma.product.findUniqueOrThrow({ where: { id: producto.id } });
            expect(despues.stock).toBe(10);
            expect(despues.costPrice?.toString()).toBe("4");
            // Solo la fila de la recepción: cancelar no deja un cambio de coste que no existió.
            expect(await prisma.costHistory.count({ where: { productId: producto.id } })).toBe(1);
        });
    });

    describe("Coste a mano", () => {
        it("se puede fijar al crear y sale en la respuesta como importe del cable", async () => {
            const res = await request(app).post(PRODUCTOS).set("Cookie", adminCookie).send({ name: "Silla", price: 120, costPrice: "75.5" });

            expect(res.status).toBe(201);
            expect(res.body.data.costPrice).toBe("75.5");
            // Crear no es cambiar: igual que el precio, no deja fila de histórico.
            expect(await prisma.costHistory.count()).toBe(0);
        });

        it("sin coste al crear, queda desconocido (null), no cero", async () => {
            const vacio = await request(app).post(PRODUCTOS).set("Cookie", adminCookie).send({ name: "Mesa", price: 300, costPrice: "" });
            const ausente = await request(app).post(PRODUCTOS).set("Cookie", adminCookie).send({ name: "Estante", price: 90 });

            expect(vacio.status).toBe(201);
            expect(vacio.body.data.costPrice).toBeNull();
            expect(ausente.body.data.costPrice).toBeNull();
        });

        it("editarlo deja una fila MANUAL; reenviar el mismo valor no deja otra", async () => {
            const producto = await prisma.product.create({ data: { name: "Tablet", price: 400, stock: 2, costPrice: 250 } });

            const cambio = await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", adminCookie).send({ costPrice: "260" });
            expect(cambio.status).toBe(200);
            expect(cambio.body.data.costPrice).toBe("260");

            const igual = await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", adminCookie).send({ costPrice: "260.00" });
            expect(igual.status).toBe(200);

            const historial = await prisma.costHistory.findMany({ where: { productId: producto.id } });
            expect(historial).toHaveLength(1);
            expect(historial[0]!.source).toBe("MANUAL");
            expect(historial[0]!.oldCost?.toString()).toBe("250");
            expect(historial[0]!.purchaseOrderId).toBeNull();
        });

        it("al editar, la cadena vacía quita el coste y una clave ausente no lo toca", async () => {
            const producto = await prisma.product.create({ data: { name: "Router", price: 60, costPrice: 35 } });

            await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", adminCookie).send({ name: "Router AX" });
            expect(await costeDe(producto.id)).toBe("35");

            const quitado = await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", adminCookie).send({ costPrice: "" });
            expect(quitado.status).toBe(200);
            expect(quitado.body.data.costPrice).toBeNull();

            const [fila] = await prisma.costHistory.findMany({ where: { productId: producto.id } });
            expect(fila!.newCost).toBeNull();
        });

        it("422 con un coste negativo", async () => {
            const producto = await prisma.product.create({ data: { name: "Altavoz", price: 45 } });

            const res = await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", adminCookie).send({ costPrice: "-1" });

            expect(res.status).toBe(422);
            expect(res.body.code).toBe("VALIDATION_ERROR");
            expect(await costeDe(producto.id)).toBeNull();
        });

        it("403: un USER no puede cambiar el coste", async () => {
            const producto = await prisma.product.create({ data: { name: "Micro", price: 70, costPrice: 40 } });

            const res = await request(app).put(`${PRODUCTOS}/${producto.id}`).set("Cookie", userCookie).send({ costPrice: "1" });

            expect(res.status).toBe(403);
            expect(await costeDe(producto.id)).toBe("40");
        });
    });

    describe("GET /products/:id/cost-history", () => {
        it("pagina del más reciente al más antiguo", async () => {
            const producto = await prisma.product.create({ data: { name: "Portátil", price: 900 } });
            for (const [i, coste] of ["500", "510", "520"].entries()) {
                await prisma.costHistory.create({
                    data: {
                        productId: producto.id,
                        newCost: coste,
                        source: "MANUAL",
                        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
                    },
                });
            }

            const res = await request(app)
                .get(`${PRODUCTOS}/${producto.id}/cost-history?limit=2`)
                .set("Cookie", userCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
            expect(res.body.data.history.map((h: { newCost: string }) => h.newCost)).toEqual(["520", "510"]);
        });

        it("404 si el producto no existe", async () => {
            const res = await request(app)
                .get(`${PRODUCTOS}/00000000-0000-0000-0000-000000000000/cost-history`)
                .set("Cookie", adminCookie);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
        });
    });
});
