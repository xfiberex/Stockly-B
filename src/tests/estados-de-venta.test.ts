import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { MAXIMO_DE_LINEAS_DE_VENTA } from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie, ALMACEN, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * AUD-005 — la máquina de estados de las ventas, bajo bloqueo.
 *
 * Lo que había: `update` leía la orden **fuera** de cualquier transacción y decidía con lo
 * leído. Dos envíos a la vez leían los dos «pendiente» y descontaban el stock dos veces; dos
 * cancelaciones de una enviada lo devolvían dos veces; y `PATCH { status: "PENDING" }` sobre
 * una enviada se aceptaba sin devolver nada.
 *
 * Las carreras se **fuerzan**, como en `recepcion-parcial.test.ts`: un `Promise.all` a secas casi
 * nunca se solapa en la base. Una transacción del test retiene la orden y sus productos mientras
 * llegan las dos peticiones.
 *  - Sin el bloqueo de la orden, las dos leen su estado sin esperar, se quedan las dos esperando
 *    a los productos, y al soltarlos aplican las dos la transición.
 *  - Con él, las dos esperan a la orden; la primera la aplica y la segunda lee lo que dejó.
 */
const VENTAS = "/api/v1/sale-orders";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Estados de una venta (AUD-005)", () => {
    let galleta: string;

    const crearVenta = async (lineas: Array<{ productId: string; quantity: number }>) => {
        const res = await request(app)
            .post(VENTAS)
            .set("Cookie", galleta)
            .send({ items: lineas.map((l) => ({ ...l, productName: "Línea", unitPrice: 10 })) });
        expect(res.status).toBe(201);
        return res.body.data.id as string;
    };

    const cambiar = (id: string, cuerpo: object) => request(app).patch(`${VENTAS}/${id}`).set("Cookie", galleta).send(cuerpo);

    const stock = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

    /** Un producto con lotes y `unidades` en uno solo, que no caduca: el envío deja la fila en `sale_order_item_lots`. */
    async function conLote(nombre: string, unidades: number) {
        const p = await crearProducto({ data: { name: nombre, price: 10, tracksLots: true } });
        await prisma.$transaction(async (tx) => {
            const lote = await tx.lot.create({ data: { productId: p.id, code: `L-${nombre}`, expiresAt: new Date("2099-12-31T00:00:00Z") } });
            await tx.stockLevel.create({ data: { productId: p.id, warehouseId: ALMACEN, lotId: lote.id, stock: unidades } });
            await tx.product.update({ where: { id: p.id }, data: { stock: unidades } });
        });
        return p;
    }

    /**
     * Lanza `peticiones` con la orden y sus productos retenidos por otra transacción, y las suelta
     * medio segundo después: el tiempo de que las dos lleguen a donde tengan que esperar.
     */
    async function conLaOrdenRetenida(ordenId: string, productos: string[], peticiones: () => Array<Promise<request.Response>>) {
        let soltar!: () => void;
        const retenida = new Promise<void>((r) => (soltar = r));
        let avisar!: () => void;
        const yaRetenida = new Promise<void>((r) => (avisar = r));

        const otra = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM sale_orders WHERE id = ${ordenId} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productos)}) ORDER BY id FOR UPDATE`;
                avisar();
                await retenida;
            },
            { timeout: 15_000 },
        );

        await yaRetenida;
        const respuestas = Promise.all(peticiones().map((p) => p.then((r) => r)));
        await esperar(500);
        soltar();
        await otra;
        return respuestas;
    }

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "estados_admin@example.com", role: "ADMIN" });
        galleta = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("el criterio de aceptación", () => {
        it("dos envíos simultáneos: un 200 y un 400, el stock baja una vez y hay una fila de lote por línea", async () => {
            const a = await conLote("EnvioA", 10);
            const b = await conLote("EnvioB", 10);
            const id = await crearVenta([{ productId: a.id, quantity: 3 }, { productId: b.id, quantity: 2 }]);

            const respuestas = await conLaOrdenRetenida(id, [a.id, b.id], () => [
                cambiar(id, { status: "SHIPPED" }),
                cambiar(id, { status: "SHIPPED" }),
            ]);

            expect(respuestas.map((r) => r.status).sort()).toEqual([200, 400]);
            expect(respuestas.find((r) => r.status === 400)!.body.code).toBe("ORDER_ALREADY_SHIPPED");
            expect([await stock(a.id), await stock(b.id)]).toEqual([7, 8]);
            const lineas = await prisma.saleOrderItem.findMany({ where: { saleOrderId: id }, include: { lots: true } });
            expect(lineas.map((l) => l.lots.length)).toEqual([1, 1]);
            expect(await prisma.stockMovement.count({ where: { productId: { in: [a.id, b.id] }, type: "OUT" } })).toBe(2);
        });

        it("dos cancelaciones de una enviada devuelven el stock una vez", async () => {
            const p = await crearProducto({ data: { name: "Cancelar", price: 10, stock: 0 } });
            await prisma.$transaction(async (tx) => {
                await tx.stockLevel.create({ data: { productId: p.id, warehouseId: ALMACEN, stock: 10 } });
                await tx.product.update({ where: { id: p.id }, data: { stock: 10 } });
            });
            const id = await crearVenta([{ productId: p.id, quantity: 4 }]);
            expect((await cambiar(id, { status: "SHIPPED" })).status).toBe(200);
            expect(await stock(p.id)).toBe(6);

            const respuestas = await conLaOrdenRetenida(id, [p.id], () => [
                cambiar(id, { status: "CANCELLED" }),
                cambiar(id, { status: "CANCELLED" }),
            ]);

            expect(respuestas.map((r) => r.status).sort()).toEqual([200, 400]);
            expect(respuestas.find((r) => r.status === 400)!.body.code).toBe("CANNOT_MODIFY_CANCELLED_ORDER");
            expect(await stock(p.id)).toBe(10);
            expect(await prisma.stockMovement.count({ where: { productId: p.id, type: "IN" } })).toBe(1);
        });

        it("`PATCH { status: \"PENDING\" }` sobre una enviada da 409 y no mueve nada", async () => {
            const p = await conLote("Volver", 5);
            const id = await crearVenta([{ productId: p.id, quantity: 2 }]);
            expect((await cambiar(id, { status: "SHIPPED" })).status).toBe(200);
            const movimientos = await prisma.stockMovement.count({ where: { productId: p.id } });

            const res = await cambiar(id, { status: "PENDING", notes: "otra vez" });

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: "INVALID_STATUS_TRANSITION", params: { desde: "SHIPPED", hasta: "PENDING" } });
            const orden = await prisma.saleOrder.findUniqueOrThrow({ where: { id } });
            expect(orden).toMatchObject({ status: "SHIPPED", notes: null });
            expect(await stock(p.id)).toBe(3);
            expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(movimientos);
        });
    });

    describe("lo que sigue valiendo", () => {
        it("una enviada se puede editar sin cambiar de estado: los datos del cliente y las notas", async () => {
            // T6-06 — es como se atiende una petición de supresión del documento del cliente.
            const p = await conLote("Editar", 5);
            const id = await crearVenta([{ productId: p.id, quantity: 1 }]);
            await cambiar(id, { status: "SHIPPED" });

            const res = await cambiar(id, { customerDocument: "", notes: "Documento retirado a petición del cliente" });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ status: "SHIPPED", notes: "Documento retirado a petición del cliente" });
        });

        it("una pendiente se cancela sin tocar el stock, y una cancelada ya no se toca", async () => {
            const p = await conLote("Pendiente", 5);
            const id = await crearVenta([{ productId: p.id, quantity: 2 }]);

            expect((await cambiar(id, { status: "CANCELLED" })).status).toBe(200);
            expect(await stock(p.id)).toBe(5);

            const despues = await cambiar(id, { notes: "tarde" });
            expect(despues.status).toBe(400);
            expect(despues.body.code).toBe("CANNOT_MODIFY_CANCELLED_ORDER");
        });

        it("borrar una orden con su envío en curso espera a que termine, y entonces no la borra", async () => {
            const p = await conLote("Borrar", 5);
            const id = await crearVenta([{ productId: p.id, quantity: 2 }]);

            const [envio, borrado] = await conLaOrdenRetenida(id, [p.id], () => [
                cambiar(id, { status: "SHIPPED" }),
                // Un instante después, para que el envío llegue antes a la cola de la orden.
                esperar(100).then(() => request(app).delete(`${VENTAS}/${id}`).set("Cookie", galleta)),
            ]);

            expect(envio!.status).toBe(200);
            expect(borrado!.status).toBe(400);
            expect(borrado!.body.code).toBe("CANNOT_DELETE_SHIPPED_ORDER");
            expect(await prisma.saleOrder.findUnique({ where: { id } })).not.toBeNull();
        });

        it("404 al cambiar o borrar una que no existe", async () => {
            const nadie = "00000000-0000-4000-8000-000000000999";

            expect((await cambiar(nadie, { status: "SHIPPED" })).body.code).toBe("SALE_ORDER_NOT_FOUND");
            expect((await request(app).delete(`${VENTAS}/${nadie}`).set("Cookie", galleta)).status).toBe(404);
        });
    });

    describe("el tope de líneas", () => {
        const lineas = (n: number) => Array.from({ length: n }, (_, i) => ({ productName: `Suelta ${i}`, quantity: 1, unitPrice: 1 }));

        it(`admite ${MAXIMO_DE_LINEAS_DE_VENTA} líneas y rechaza una más con 422`, async () => {
            const justo = await request(app).post(VENTAS).set("Cookie", galleta).send({ items: lineas(MAXIMO_DE_LINEAS_DE_VENTA) });
            const deMas = await request(app).post(VENTAS).set("Cookie", galleta).send({ items: lineas(MAXIMO_DE_LINEAS_DE_VENTA + 1) });

            expect(justo.status).toBe(201);
            expect(deMas.status).toBe(422);
        });
    });
});
