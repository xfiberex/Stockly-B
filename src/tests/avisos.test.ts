import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, numeroDeVenta } from "./helpers";
import { avisosSchema, avisosSinLeerSchema } from "@/contratos/api";
import { notificationsService } from "@/modules/notifications/notifications.service";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn().mockResolvedValue({ url: "https://x/y.jpg", publicId: "x/y" }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";

// T5-12 — avisos dentro de la aplicación.

const BASE = "/api/v1/notifications";
const DIA = 86_400_000;

interface Cuenta { id: string; cookie: string }

async function cuenta(email: string, role: "ADMIN" | "USER" | "WAREHOUSE", isActive = true): Promise<Cuenta> {
    const usuario = await createUser({ email, role });
    if (!isActive) await prisma.user.update({ where: { id: usuario.id }, data: { isActive: false } });
    return { id: usuario.id, cookie: getAuthCookie(usuario.id) };
}

const avisosDe = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function salida(productId: string, cantidad: number, cookie: string) {
    const res = await request(app)
        .post(`/api/v1/products/${productId}/movements`)
        .set("Cookie", cookie)
        .send({ type: "OUT", quantity: cantidad, reason: "Venta" });
    expect(res.status).toBe(201);
    await esperarAlertasEnVuelo();
}

describe("Avisos dentro de la aplicación (T5-12)", () => {
    let ana: Cuenta;
    let bruno: Cuenta;
    let inactivo: Cuenta;
    let usuario: Cuenta;
    let almacen: Cuenta;

    beforeEach(async () => {
        await cleanDb();
        notificationsService.olvidarMantenimiento();
        (sendLowStockAlertEmail as jest.Mock).mockClear();
        ana = await cuenta("avisos_ana@example.com", "ADMIN");
        bruno = await cuenta("avisos_bruno@example.com", "ADMIN");
        inactivo = await cuenta("avisos_inactivo@example.com", "ADMIN", false);
        usuario = await cuenta("avisos_usuario@example.com", "USER");
        almacen = await cuenta("avisos_almacen@example.com", "WAREHOUSE");
    });

    afterAll(async () => {
        await cleanDb();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("Stock bajo", () => {
        it("bajar de mínimo avisa a cada administrador activo, aunque el correo esté desactivado", async () => {
            const producto = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

            await salida(producto.id, 2, almacen.cookie);

            // El criterio de aceptación: el ajuste del correo está apagado —es su valor por
            // defecto— y aun así cada ADMIN activo tiene su aviso.
            expect(sendLowStockAlertEmail).not.toHaveBeenCalled();
            for (const admin of [ana, bruno]) {
                const [aviso, ...resto] = await avisosDe(admin.id);
                expect(resto).toHaveLength(0);
                expect(aviso).toMatchObject({
                    type: "LOW_STOCK",
                    entityId: producto.id,
                    readAt: null,
                    data: { productName: "Cable HDMI", stock: 4, minStock: 5 },
                });
            }
            // Ni el administrador desactivado, ni quien no es administrador.
            for (const otro of [inactivo, usuario, almacen]) expect(await avisosDe(otro.id)).toHaveLength(0);
        });

        it("con el correo activado salen las dos cosas", async () => {
            await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
            const producto = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

            await salida(producto.id, 2, ana.cookie);

            expect(sendLowStockAlertEmail).toHaveBeenCalled();
            expect(await avisosDe(ana.id)).toHaveLength(1);
        });

        it("quedarse por encima del mínimo no avisa", async () => {
            const producto = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 10, minStock: 5 } });

            await salida(producto.id, 2, ana.cookie);

            expect(await prisma.notification.count()).toBe(0);
        });

        it("el mismo producto que vuelve a bajar no apila otro aviso: reabre el suyo con la cifra nueva", async () => {
            const producto = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

            await salida(producto.id, 2, ana.cookie);
            const [primero] = await avisosDe(ana.id);
            await request(app).post(`${BASE}/${primero!.id}/read`).set("Cookie", ana.cookie).expect(200);

            await salida(producto.id, 1, ana.cookie);

            const avisos = await avisosDe(ana.id);
            expect(avisos).toHaveLength(1);
            expect(avisos[0]).toMatchObject({ id: primero!.id, readAt: null, data: { stock: 3 } });
            expect(avisos[0]!.createdAt.getTime()).toBeGreaterThan(primero!.createdAt.getTime());
            // Bruno no lo había leído: sigue teniendo uno, no dos.
            expect(await avisosDe(bruno.id)).toHaveLength(1);
        });

        it("la fecha del aviso es la de ahora, no la de ahora en la zona del servidor de la base", async () => {
            // El aviso se inserta con SQL, y un `now()` a secas en una columna sin zona guarda
            // la hora local de la sesión de PostgreSQL: en Santo Domingo, cuatro horas menos.
            const producto = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

            const antes = Date.now();
            await salida(producto.id, 2, ana.cookie);

            const [aviso] = await avisosDe(ana.id);
            expect(aviso!.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 1000);
            expect(aviso!.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("Venta que no se puede enviar", () => {
        async function ventaSinStock() {
            const producto = await prisma.product.create({ data: { name: "Teclado", price: 30, stock: 3, minStock: 0 } });
            const orden = await prisma.saleOrder.create({
                data: { number: await numeroDeVenta(), items: { create: [{ productId: producto.id, productName: "Teclado", quantity: 5, unitPrice: 30 }] } },
            });
            return { producto, orden };
        }

        it("si el almacén no puede enviarla por falta de stock, se enteran los administradores", async () => {
            const { orden } = await ventaSinStock();

            const res = await request(app).post(`/api/v1/sale-orders/${orden.id}/ship`).set("Cookie", almacen.cookie);
            await esperarAlertasEnVuelo();

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INSUFFICIENT_STOCK");
            for (const admin of [ana, bruno]) {
                expect(await avisosDe(admin.id)).toEqual([
                    expect.objectContaining({
                        type: "SALE_UNSHIPPABLE",
                        entityId: orden.id,
                        data: { orderNumber: orden.number, productName: "Teclado", available: 3, required: 5 },
                    }),
                ]);
            }
            expect(await avisosDe(almacen.id)).toHaveLength(0);
            // El aviso sobrevive a la transacción que se deshizo; la orden sigue como estaba.
            expect((await prisma.saleOrder.findUniqueOrThrow({ where: { id: orden.id } })).status).toBe("PENDING");
        });

        it("a quien lo intentó no se le avisa: ya tiene el error delante", async () => {
            const { orden } = await ventaSinStock();

            await request(app).patch(`/api/v1/sale-orders/${orden.id}`).set("Cookie", ana.cookie).send({ status: "SHIPPED" }).expect(400);
            await esperarAlertasEnVuelo();

            expect(await avisosDe(ana.id)).toHaveLength(0);
            expect(await avisosDe(bruno.id)).toHaveLength(1);
        });

        it("una venta que sí se envía no deja este aviso", async () => {
            const producto = await prisma.product.create({ data: { name: "Teclado", price: 30, stock: 9, minStock: 0 } });
            const orden = await prisma.saleOrder.create({
                data: { number: await numeroDeVenta(), items: { create: [{ productId: producto.id, productName: "Teclado", quantity: 5, unitPrice: 30 }] } },
            });

            await request(app).post(`/api/v1/sale-orders/${orden.id}/ship`).set("Cookie", almacen.cookie).expect(200);
            await esperarAlertasEnVuelo();

            expect(await prisma.notification.count({ where: { type: "SALE_UNSHIPPABLE" } })).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("Compras que pasaron su plazo", () => {
        const AHORA = new Date("2026-09-30T15:00:00Z");
        const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA);

        it("avisa de las abiertas fuera de plazo, con el plazo del proveedor o el de Configuración", async () => {
            const rapido = await prisma.supplier.create({ data: { name: "Rápido SA", leadTimeDays: 3 } });
            const sinPlazo = await prisma.supplier.create({ data: { name: "Sin Plazo SL" } });

            const atrasada = await prisma.purchaseOrder.create({ data: { supplierId: rapido.id, createdAt: hace(10) } });
            const parcial = await prisma.purchaseOrder.create({
                data: { supplierId: sinPlazo.id, status: "PARTIALLY_RECEIVED", createdAt: hace(10) },
            });
            const sinProveedor = await prisma.purchaseOrder.create({ data: { createdAt: hace(10) } });
            // Las que no: dentro de plazo, recibida y cancelada.
            await prisma.purchaseOrder.create({ data: { supplierId: rapido.id, createdAt: hace(2) } });
            await prisma.purchaseOrder.create({ data: { supplierId: rapido.id, status: "RECEIVED", createdAt: hace(10) } });
            await prisma.purchaseOrder.create({ data: { supplierId: rapido.id, status: "CANCELLED", createdAt: hace(10) } });

            await notificationsService.mantener(AHORA);

            const avisos = await avisosDe(ana.id);
            const porOrden = new Map(avisos.map((a) => [a.entityId, a]));
            expect(avisos).toHaveLength(3);
            expect(avisos.every((a) => a.type === "PURCHASE_OVERDUE")).toBe(true);
            // Pedida el 20 de septiembre: con 3 días vencía el 23; con los 7 por defecto, el 27.
            expect(porOrden.get(atrasada.id)!.data).toEqual({ supplierName: "Rápido SA", dueDate: "2026-09-23" });
            expect(porOrden.get(parcial.id)!.data).toEqual({ supplierName: "Sin Plazo SL", dueDate: "2026-09-27" });
            expect(porOrden.get(sinProveedor.id)!.data).toEqual({ supplierName: null, dueDate: "2026-09-27" });
            expect(porOrden.get(atrasada.id)!.createdAt).toEqual(AHORA);

            expect(await avisosDe(bruno.id)).toHaveLength(3);
            for (const otro of [inactivo, usuario, almacen]) expect(await avisosDe(otro.id)).toHaveLength(0);
        });

        it("el día en que vence todavía no está atrasada, y el día se cuenta en la zona del negocio", async () => {
            const proveedor = await prisma.supplier.create({ data: { name: "Rápido SA", leadTimeDays: 5 } });
            // Las 02:00 UTC del 20 son las 22:00 del **19** en Santo Domingo: vence el 24, no el 25.
            await prisma.purchaseOrder.create({ data: { supplierId: proveedor.id, createdAt: new Date("2026-09-20T02:00:00Z") } });

            // Todavía día 24 en Santo Domingo —aunque ya sea 25 en UTC—.
            await notificationsService.mantener(new Date("2026-09-25T03:00:00Z"));
            expect(await prisma.notification.count()).toBe(0);

            // Día 25 en Santo Domingo.
            await notificationsService.mantener(new Date("2026-09-25T05:00:00Z"));
            const [aviso] = await avisosDe(ana.id);
            expect(aviso!.data).toEqual({ supplierName: "Rápido SA", dueDate: "2026-09-24" });
        });

        it("repetirlo no duplica el aviso ni reabre el que ya se leyó", async () => {
            await prisma.purchaseOrder.create({ data: { createdAt: hace(20) } });

            await notificationsService.mantener(AHORA);
            await request(app).post(`${BASE}/read-all`).set("Cookie", ana.cookie).expect(200);
            await notificationsService.mantener(new Date(AHORA.getTime() + DIA));

            const avisos = await avisosDe(ana.id);
            expect(avisos).toHaveLength(1);
            expect(avisos[0]!.readAt).not.toBeNull();
            expect(avisos[0]!.createdAt).toEqual(AHORA);
        });

        it("la consulta del contador hace el mantenimiento, pero no en cada consulta", async () => {
            await prisma.purchaseOrder.create({ data: { createdAt: new Date(Date.now() - 30 * DIA) } });

            const primera = await request(app).get(`${BASE}/unread-count`).set("Cookie", ana.cookie);
            expect(primera.body.data).toEqual({ unread: 1 });

            // Otra orden atrasada, y otra consulta dentro de la pausa: aún no se ha mirado.
            await prisma.purchaseOrder.create({ data: { createdAt: new Date(Date.now() - 30 * DIA) } });
            const segunda = await request(app).get(`${BASE}/unread-count`).set("Cookie", ana.cookie);
            expect(segunda.body.data).toEqual({ unread: 1 });

            notificationsService.olvidarMantenimiento();
            const tercera = await request(app).get(`${BASE}/unread-count`).set("Cookie", ana.cookie);
            expect(tercera.body.data).toEqual({ unread: 2 });
        });

        it("si el mantenimiento falla, el contador responde igual", async () => {
            const espia = jest.spyOn(notificationsService, "mantener").mockRejectedValueOnce(new Error("base ocupada"));

            const res = await request(app).get(`${BASE}/unread-count`).set("Cookie", ana.cookie);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({ unread: 0 });
            expect(espia).toHaveBeenCalledTimes(1);
            espia.mockRestore();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("La purga", () => {
        it("se van los leídos hace más de 90 días; los recientes y los que nadie ha leído, no", async () => {
            const ahora = new Date("2026-09-30T15:00:00Z");
            const aviso = (entityId: string, readAt: Date | null, createdAt: Date) =>
                prisma.notification.create({
                    data: {
                        userId: ana.id, type: "LOW_STOCK", entityId, readAt, createdAt,
                        data: { productName: entityId, stock: 0, minStock: 1 },
                    },
                });
            await aviso("leido-hace-91", new Date(ahora.getTime() - 91 * DIA), new Date(ahora.getTime() - 200 * DIA));
            await aviso("leido-hace-89", new Date(ahora.getTime() - 89 * DIA), new Date(ahora.getTime() - 200 * DIA));
            await aviso("sin-leer-antiguo", null, new Date(ahora.getTime() - 200 * DIA));

            await notificationsService.mantener(ahora);

            expect((await avisosDe(ana.id)).map((a) => a.entityId).sort()).toEqual(["leido-hace-89", "sin-leer-antiguo"]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("La campana: leer y marcar", () => {
        async function tres(userId: string) {
            for (const [i, nombre] of ["Uno", "Dos", "Tres"].entries()) {
                await prisma.notification.create({
                    data: {
                        userId, type: "LOW_STOCK", entityId: `p-${nombre}`,
                        data: { productName: nombre, stock: i, minStock: 5 },
                        createdAt: new Date(Date.now() - (3 - i) * 60_000),
                    },
                });
            }
        }

        it("GET /notifications da los míos, del más reciente al más antiguo, con su contador, y encaja en el contrato", async () => {
            await tres(ana.id);
            await prisma.notification.create({
                data: { userId: ana.id, type: "SALE_UNSHIPPABLE", entityId: "v-1", data: { productName: "X", available: 1, required: 2 }, readAt: new Date() },
            });
            await prisma.notification.create({
                data: { userId: ana.id, type: "PURCHASE_OVERDUE", entityId: "c-1", data: { supplierName: null, dueDate: "2026-09-01" }, createdAt: new Date(Date.now() - DIA) },
            });
            await tres(bruno.id);

            const res = await request(app).get(BASE).set("Cookie", ana.cookie);

            expect(res.status).toBe(200);
            expect(() => avisosSchema.parse(res.body.data)).not.toThrow();
            expect(res.body.data.unread).toBe(4);
            expect(res.body.data.items.map((a: { entityId: string }) => a.entityId)).toEqual(["v-1", "p-Tres", "p-Dos", "p-Uno", "c-1"]);
            // Nada de más en el cable: ni de quién es, ni campos internos.
            expect(Object.keys(res.body.data.items[0]).sort()).toEqual(["createdAt", "data", "entityId", "id", "readAt", "type"]);
        });

        it("enseña los 30 últimos, y el contador cuenta también los que no enseña", async () => {
            await prisma.notification.createMany({
                data: Array.from({ length: 35 }, (_, i) => ({
                    userId: ana.id, type: "LOW_STOCK" as const, entityId: `p-${i}`,
                    data: { productName: `P${i}`, stock: 0, minStock: 1 },
                    createdAt: new Date(Date.now() - i * 60_000),
                })),
            });

            const res = await request(app).get(BASE).set("Cookie", ana.cookie);

            expect(res.body.data.items).toHaveLength(30);
            expect(res.body.data.items[0].entityId).toBe("p-0");
            expect(res.body.data.unread).toBe(35);
        });

        it("marcar uno como leído lo quita del contador en la siguiente consulta, desde cualquier pestaña", async () => {
            await tres(ana.id);
            const [aviso] = await avisosDe(ana.id);

            const marcado = await request(app).post(`${BASE}/${aviso!.id}/read`).set("Cookie", ana.cookie);
            expect(marcado.status).toBe(200);
            expect(() => avisosSinLeerSchema.parse(marcado.body.data)).not.toThrow();
            expect(marcado.body.data).toEqual({ unread: 2 });

            // «Otra pestaña» es otra petición con la misma sesión: no hay estado por pestaña.
            const otraPestana = await request(app).get(`${BASE}/unread-count`).set("Cookie", ana.cookie);
            expect(otraPestana.body.data).toEqual({ unread: 2 });
            const lista = await request(app).get(BASE).set("Cookie", ana.cookie);
            expect(lista.body.data.items.find((a: { id: string }) => a.id === aviso!.id).readAt).not.toBeNull();
        });

        it("marcarlo dos veces no es un error ni mueve la fecha de lectura", async () => {
            await tres(ana.id);
            const [aviso] = await avisosDe(ana.id);

            await request(app).post(`${BASE}/${aviso!.id}/read`).set("Cookie", ana.cookie).expect(200);
            const leido = await prisma.notification.findUniqueOrThrow({ where: { id: aviso!.id } });
            const otraVez = await request(app).post(`${BASE}/${aviso!.id}/read`).set("Cookie", ana.cookie);

            expect(otraVez.status).toBe(200);
            expect(otraVez.body.data).toEqual({ unread: 2 });
            expect((await prisma.notification.findUniqueOrThrow({ where: { id: aviso!.id } })).readAt).toEqual(leido.readAt);
        });

        it("marcar todos deja el contador a cero, y solo el mío", async () => {
            await tres(ana.id);
            await tres(bruno.id);

            const res = await request(app).post(`${BASE}/read-all`).set("Cookie", ana.cookie);

            expect(res.body.data).toEqual({ unread: 0 });
            expect(await prisma.notification.count({ where: { userId: ana.id, readAt: null } })).toBe(0);
            expect(await prisma.notification.count({ where: { userId: bruno.id, readAt: null } })).toBe(3);
        });

        it("el aviso de otro usuario responde 404 y no se marca", async () => {
            await tres(bruno.id);
            const [ajeno] = await avisosDe(bruno.id);

            const res = await request(app).post(`${BASE}/${ajeno!.id}/read`).set("Cookie", ana.cookie);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("NOTIFICATION_NOT_FOUND");
            expect((await prisma.notification.findUniqueOrThrow({ where: { id: ajeno!.id } })).readAt).toBeNull();
        });

        it("uno que no existe, 404", async () => {
            const res = await request(app).post(`${BASE}/no-existe/read`).set("Cookie", ana.cookie);
            expect(res.status).toBe(404);
        });

        it("cualquier rol tiene campana; sin sesión, 401 en las cuatro rutas", async () => {
            for (const quien of [usuario, almacen]) {
                const res = await request(app).get(BASE).set("Cookie", quien.cookie);
                expect(res.status).toBe(200);
                expect(res.body.data).toEqual({ items: [], unread: 0 });
            }

            expect((await request(app).get(BASE)).status).toBe(401);
            expect((await request(app).get(`${BASE}/unread-count`)).status).toBe(401);
            expect((await request(app).post(`${BASE}/read-all`)).status).toBe(401);
            expect((await request(app).post(`${BASE}/x/read`)).status).toBe(401);
        });

        it("los avisos de una cuenta se van con ella", async () => {
            await tres(bruno.id);

            await prisma.user.delete({ where: { id: bruno.id } });

            expect(await prisma.notification.count()).toBe(0);
        });
    });
});
