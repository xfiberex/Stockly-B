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
 * T5-04 — recepción parcial de órdenes de compra.
 *
 * El defecto: una orden pasaba de pendiente a recibida de una vez y sumaba **todo** lo pedido.
 * Un proveedor que entrega 60 de 100 obligaba a mentir en un sentido o en el otro. Lo que más
 * vigila este archivo es la otra cara, la de T0-04: **cancelar retira lo que entró**, que ya no
 * es lo pedido.
 */

const COMPRAS = "/api/v1/purchase-orders";

describe("Recepción parcial de órdenes de compra (T5-04)", () => {
    let cookie: string;
    let cookieUser: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "rp_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "rp_user@example.com", role: "USER" });
        cookie = getAuthCookie(admin.id);
        cookieUser = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.costHistory.deleteMany();
        await prisma.purchaseOrderItem.deleteMany();
        await prisma.purchaseOrder.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const producto = (name: string, stock: number, costPrice?: number) =>
        prisma.product.create({ data: { name, price: 20, stock, ...(costPrice !== undefined && { costPrice }) } });

    const stockDe = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

    /** Crea la orden por la API y devuelve su id y los ids de sus líneas, en orden. */
    async function ordenDe(items: Array<{ productId?: string; productName: string; quantity: number; unitPrice?: number }>) {
        const res = await request(app)
            .post(COMPRAS)
            .set("Cookie", cookie)
            .send({ items: items.map((i) => ({ unitPrice: 5, ...i })) });
        expect(res.status).toBe(201);
        // Las líneas no vuelven en el orden de creación garantizado: se buscan por nombre.
        const lineas = items.map((i) => res.body.data.items.find((l: { productName: string }) => l.productName === i.productName).id as string);
        return { id: res.body.data.id as string, lineas };
    }

    const recibir = (id: string, items: Array<{ itemId: string; quantity: number }>, galleta = cookie) =>
        request(app).post(`${COMPRAS}/${id}/receipts`).set("Cookie", galleta).send({ items });

    const cambiarEstado = (id: string, status: string) =>
        request(app).patch(`${COMPRAS}/${id}`).set("Cookie", cookie).send({ status });

    describe("El criterio", () => {
        it("recibir 60 de 100 suma 60 y deja la orden a medias; los 40 restantes la cierran", async () => {
            const p = await producto("Teclado", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Teclado", quantity: 100 }]);

            const primera = await recibir(id, [{ itemId: lineas[0]!, quantity: 60 }]);

            expect(primera.status).toBe(201);
            expect(primera.body.data.status).toBe("PARTIALLY_RECEIVED");
            expect(primera.body.data.items[0].receivedQuantity).toBe(60);
            expect(await stockDe(p.id)).toBe(60);

            const segunda = await recibir(id, [{ itemId: lineas[0]!, quantity: 40 }]);

            expect(segunda.body.data.status).toBe("RECEIVED");
            expect(segunda.body.data.items[0].receivedQuantity).toBe(100);
            expect(await stockDe(p.id)).toBe(100);

            // Un movimiento IN por entrega, con lo que llegó en cada una.
            const movimientos = await prisma.stockMovement.findMany({ where: { productId: p.id }, orderBy: { createdAt: "asc" } });
            expect(movimientos.map((m) => [m.type, m.delta, m.stockAfter])).toEqual([
                ["IN", 60, 60],
                ["IN", 40, 100],
            ]);
        });

        it("no se puede recibir más de lo que queda: 400 con código y nada cambia", async () => {
            const p = await producto("Ratón", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Ratón", quantity: 100 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 60 }]);

            const res = await recibir(id, [{ itemId: lineas[0]!, quantity: 41 }]);

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("RECEIPT_EXCEEDS_PENDING");
            expect(res.body.params).toEqual({ producto: "Ratón", pendiente: 40, requerido: 41 });
            expect(await stockDe(p.id)).toBe(60);
            expect((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: lineas[0]! } })).receivedQuantity).toBe(60);
        });

        it("cancelar una orden a medias retira 60, no 100", async () => {
            const p = await producto("Monitor", 10);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Monitor", quantity: 100 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 60 }]);
            expect(await stockDe(p.id)).toBe(70);

            const res = await cambiarEstado(id, "CANCELLED");

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("CANCELLED");
            // Con `quantity` quedaría en -30, o se rechazaría por «ya consumidas» sin serlo.
            expect(await stockDe(p.id)).toBe(10);
            const salida = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "OUT" } });
            expect([salida.delta, salida.stockAfter]).toEqual([-60, 10]);
        });
    });

    describe("Cancelar", () => {
        it("una orden a medias con esas unidades ya vendidas no se cancela, y sigue a medias", async () => {
            const p = await producto("Webcam", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Webcam", quantity: 10 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 6 }]);
            await prisma.product.update({ where: { id: p.id }, data: { stock: 2 } });

            const res = await cambiarEstado(id, "CANCELLED");

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("CANNOT_CANCEL_UNITS_CONSUMED");
            expect(res.body.params).toEqual({ producto: "Webcam", disponible: 2, requerido: 6 });
            expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).status).toBe("PARTIALLY_RECEIVED");
        });

        it("solo retira las líneas que recibieron algo", async () => {
            const a = await producto("Llega", 0);
            const b = await producto("NoLlega", 5);
            const { id, lineas } = await ordenDe([
                { productId: a.id, productName: "Llega", quantity: 4 },
                { productId: b.id, productName: "NoLlega", quantity: 4 },
            ]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 4 }]);

            expect((await cambiarEstado(id, "CANCELLED")).status).toBe(200);

            expect(await stockDe(a.id)).toBe(0);
            expect(await stockDe(b.id)).toBe(5);
            expect(await prisma.stockMovement.count({ where: { productId: b.id } })).toBe(0);
        });
    });

    describe("Qué recibe cada recepción", () => {
        it("el coste medio se calcula con lo recibido, no con lo pedido", async () => {
            // 10 en stock a 3; llegan 10 de 100 a 5 → (10·3 + 10·5) / 20 = 4. Con las 100, sería 4,82.
            const p = await producto("Cable", 10, 3);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Cable", quantity: 100, unitPrice: 5 }]);

            await recibir(id, [{ itemId: lineas[0]!, quantity: 10 }]);

            expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).costPrice)).toBe(4);
        });

        it("marcar recibida una orden a medias recibe solo lo que falta", async () => {
            const p = await producto("Hub", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Hub", quantity: 100 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 60 }]);

            const res = await cambiarEstado(id, "RECEIVED");

            expect(res.body.data.status).toBe("RECEIVED");
            expect(res.body.data.items[0].receivedQuantity).toBe(100);
            // Sumando `quantity` otra vez, serían 160.
            expect(await stockDe(p.id)).toBe(100);
        });

        it("las líneas que no se envían no reciben nada, y la orden no se cierra hasta completarlas todas", async () => {
            const a = await producto("A", 0);
            const { id, lineas } = await ordenDe([
                { productId: a.id, productName: "A", quantity: 3 },
                { productName: "Portes", quantity: 1 },
            ]);

            const res = await recibir(id, [{ itemId: lineas[0]!, quantity: 3 }]);

            // La línea del producto está completa, pero la escrita a mano no: sigue a medias.
            expect(res.body.data.status).toBe("PARTIALLY_RECEIVED");
            expect(await stockDe(a.id)).toBe(3);

            const final = await recibir(id, [{ itemId: lineas[1]!, quantity: 1 }]);
            expect(final.body.data.status).toBe("RECEIVED");
            expect(await stockDe(a.id)).toBe(3);
        });

        it("si una línea falla no entra ninguna, aunque las demás quepan", async () => {
            const a = await producto("Cabe", 0);
            const b = await producto("NoCabe", 0);
            const { id, lineas } = await ordenDe([
                { productId: a.id, productName: "Cabe", quantity: 10 },
                { productId: b.id, productName: "NoCabe", quantity: 1 },
            ]);

            const res = await recibir(id, [
                { itemId: lineas[0]!, quantity: 10 },
                { itemId: lineas[1]!, quantity: 2 },
            ]);

            expect(res.status).toBe(400);
            expect(await stockDe(a.id)).toBe(0);
            expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
        });

        it("queda en la auditoría como recepción, con lo que llegó", async () => {
            const p = await producto("Auditado", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Auditado", quantity: 5 }]);

            await recibir(id, [{ itemId: lineas[0]!, quantity: 2 }]);

            const entrada = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "ORDER_RECEIVE" } });
            expect(entrada.details).toEqual({ status: "PARTIALLY_RECEIVED", items: [{ itemId: lineas[0], quantity: 2 }] });
        });
    });

    describe("Reglas", () => {
        it("404 si la línea es de otra orden", async () => {
            const p = await producto("Ajeno", 0);
            const una = await ordenDe([{ productId: p.id, productName: "Ajeno", quantity: 5 }]);
            const otra = await ordenDe([{ productName: "Otra", quantity: 5 }]);

            const res = await recibir(otra.id, [{ itemId: una.lineas[0]!, quantity: 1 }]);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("PURCHASE_ORDER_ITEM_NOT_FOUND");
            expect(await stockDe(p.id)).toBe(0);
        });

        it("400 al recibir en una orden ya recibida o cancelada", async () => {
            const recibida = await ordenDe([{ productName: "R", quantity: 1 }]);
            await cambiarEstado(recibida.id, "RECEIVED");
            const cancelada = await ordenDe([{ productName: "C", quantity: 1 }]);
            await cambiarEstado(cancelada.id, "CANCELLED");

            for (const { id, lineas } of [recibida, cancelada]) {
                const res = await recibir(id, [{ itemId: lineas[0]!, quantity: 1 }]);
                expect(res.status).toBe(400);
                expect(res.body.code).toBe("ORDER_NOT_RECEIVABLE");
            }
        });

        it("422 si la misma línea aparece dos veces: sumarían y esquivarían el tope", async () => {
            const { id, lineas } = await ordenDe([{ productName: "Doble", quantity: 10 }]);

            const res = await recibir(id, [
                { itemId: lineas[0]!, quantity: 6 },
                { itemId: lineas[0]!, quantity: 6 },
            ]);

            expect(res.status).toBe(422);
        });

        it("una orden con mercancía recibida no vuelve a pendiente", async () => {
            const p = await producto("Vuelta", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Vuelta", quantity: 10 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 4 }]);

            const res = await cambiarEstado(id, "PENDING");

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("CANNOT_REOPEN_RECEIVED_ORDER");
        });

        it("una orden a medias no se puede eliminar", async () => {
            const { id, lineas } = await ordenDe([{ productName: "Borrar", quantity: 10 }]);
            await recibir(id, [{ itemId: lineas[0]!, quantity: 1 }]);

            const res = await request(app).delete(`${COMPRAS}/${id}`).set("Cookie", cookie);

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("CANNOT_DELETE_RECEIVED_ORDER");
        });

        it("403: un USER no registra recepciones", async () => {
            const { id, lineas } = await ordenDe([{ productName: "Prohibido", quantity: 1 }]);

            expect((await recibir(id, [{ itemId: lineas[0]!, quantity: 1 }], cookieUser)).status).toBe(403);
        });

        it("dos recepciones que se cruzan no pasan entre las dos de lo pedido", async () => {
            const p = await producto("Carrera", 0);
            const { id, lineas } = await ordenDe([{ productId: p.id, productName: "Carrera", quantity: 100 }]);

            // Como en T5-03, la carrera se fuerza: un `Promise.all` no llega a solaparse en la
            // base. Una transacción del test bloquea la orden y apunta 60 recibidas sin
            // confirmar; entretanto llega una petición de 60.
            //  - Con el `FOR UPDATE` del servicio, espera, lee las 60 ya confirmadas → 400.
            //  - Sin él, lee 0, recibe 60 → 201, y la línea acaba con 120 de 100.
            let soltar!: () => void;
            const retenida = new Promise<void>((r) => (soltar = r));
            const otraRecepcion = prisma.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
                    await tx.purchaseOrderItem.update({ where: { id: lineas[0]! }, data: { receivedQuantity: 60 } });
                    await retenida;
                },
                { timeout: 15_000 },
            );
            const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

            await esperar(300);
            const peticion = recibir(id, [{ itemId: lineas[0]!, quantity: 60 }]).then((r) => r);
            await esperar(500);
            soltar();
            await otraRecepcion;

            const res = await peticion;
            expect(res.status).toBe(400);
            expect(res.body.code).toBe("RECEIPT_EXCEEDS_PENDING");
            expect((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: lineas[0]! } })).receivedQuantity).toBe(60);
        });
    });
});
