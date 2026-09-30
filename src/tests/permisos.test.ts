import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { MONTAJES } from "@/routes";
import { PERMISOS, rolSchema, type RutaConPermiso } from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import type { $Enums } from "@/generated/prisma/client";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-13 — la matriz rol × ruta, recorrida contra la API de verdad.
 *
 * Con dos roles, «todo lo que escribe exige ADMIN» se podía comprobar a ojo. Con tres, y unas
 * treinta rutas de escritura, es fácil dejarse una: por eso la matriz vive en un solo sitio
 * (`PERMISOS`, en el contrato) y este archivo exige tres cosas. Que **cada ruta montada tenga su
 * fila**, así que una ruta nueva sin decidir su rol rompe la suite. Que **cada ruta use su propia
 * fila**, no la de otra copiada al lado. Y que **cada rol reciba 403 exactamente donde su fila lo
 * dice**, con una petición real.
 */

type Capa = {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: { rutaConPermiso?: string } }>;
    };
};

/** Las rutas montadas fuera de `/auth`, como `"<MÉTODO> <prefijo><ruta>"`, con la fila que usan. */
function rutasMontadas(): Array<{ clave: string; filaUsada: string | undefined }> {
    return MONTAJES.filter(([prefijo]) => prefijo !== "/auth").flatMap(([prefijo, modulo]) =>
        (modulo.stack as Capa[])
            .filter((capa) => capa.route)
            .flatMap(({ route }) =>
                Object.keys(route!.methods).map((metodo) => ({
                    clave: `${metodo.toUpperCase()} ${prefijo}${route!.path === "/" ? "" : route!.path}`,
                    filaUsada: route!.stack.find((c) => c.handle.rutaConPermiso)?.handle.rutaConPermiso,
                })),
            ),
    );
}

const ROLES = rolSchema.options;

describe("Permisos por rol (T5-13)", () => {
    const galletas = {} as Record<$Enums.Role, string>;

    beforeAll(async () => {
        await cleanDb();
        for (const rol of ROLES) {
            const usuario = await createUser({ email: `permisos_${rol.toLowerCase()}@example.com`, role: rol });
            galletas[rol] = getAuthCookie(usuario.id);
        }
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("La matriz y las rutas coinciden", () => {
        const montadas = rutasMontadas();

        it("cada ruta montada tiene su fila en PERMISOS", () => {
            const sinFila = montadas.map((r) => r.clave).filter((clave) => !(clave in PERMISOS));
            expect(sinFila).toEqual([]);
        });

        it("cada fila de PERMISOS corresponde a una ruta montada", () => {
            const claves = new Set(montadas.map((r) => r.clave));
            expect(Object.keys(PERMISOS).filter((clave) => !claves.has(clave))).toEqual([]);
        });

        it("cada ruta se protege con su propia fila, no con otra", () => {
            const malProtegidas = montadas.filter((r) => r.filaUsada !== r.clave);
            expect(malProtegidas).toEqual([]);
        });
    });

    describe("Cada rol recibe 403 exactamente donde su fila lo dice", () => {
        const casos = (Object.keys(PERMISOS) as RutaConPermiso[]).flatMap((ruta) =>
            ROLES.map((rol) => ({ ruta, rol, permitido: (PERMISOS[ruta] as readonly string[]).includes(rol) })),
        );

        it.each(casos)("$rol → $ruta (permitido: $permitido)", async ({ ruta, rol, permitido }) => {
            const [metodo, camino] = ruta.split(" ") as [string, string];
            // Un id que no existe y un cuerpo vacío: lo que se mira es si el rol pasa la puerta,
            // no lo que la ruta haga después (un 404 o un 422 también dicen «ha pasado»).
            const url = `/api/v1${camino.replace(":id", randomUUID())}`;
            const peticion = request(app)[metodo.toLowerCase() as "get" | "post" | "put" | "patch" | "delete"](url);
            const res = await peticion.set("Cookie", galletas[rol]).send({});

            if (permitido) {
                expect(res.status).not.toBe(403);
            } else {
                expect(res.status).toBe(403);
                expect(res.body.code).toBe("FORBIDDEN");
            }
        });
    });

    describe("El criterio: un WAREHOUSE recibe una compra y no puede cambiar un precio", () => {
        afterEach(async () => {
            await prisma.costHistory.deleteMany();
            await prisma.saleOrderItem.deleteMany();
            await prisma.saleOrder.deleteMany();
            await prisma.purchaseOrderItem.deleteMany();
            await prisma.purchaseOrder.deleteMany();
            await prisma.stockMovement.deleteMany();
            await prisma.priceHistory.deleteMany();
            await prisma.product.deleteMany();
            await prisma.auditLog.deleteMany();
        });

        it("recibe la orden de compra: suma el stock y queda en la auditoría a su nombre", async () => {
            const producto = await prisma.product.create({ data: { name: "Cable", price: 10, stock: 0 } });
            const orden = await request(app)
                .post("/api/v1/purchase-orders")
                .set("Cookie", galletas.ADMIN)
                .send({ items: [{ productId: producto.id, productName: "Cable", quantity: 12, unitPrice: 4 }] });
            expect(orden.status).toBe(201);

            const res = await request(app)
                .post(`/api/v1/purchase-orders/${orden.body.data.id}/receipts`)
                .set("Cookie", galletas.WAREHOUSE)
                .send({ items: [{ itemId: orden.body.data.items[0].id, quantity: 12 }] });

            expect(res.status).toBe(201);
            expect(res.body.data.status).toBe("RECEIVED");
            expect((await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(12);
            const auditoria = await prisma.auditLog.findFirst({ where: { entityId: orden.body.data.id, action: "ORDER_RECEIVE" } });
            expect(auditoria?.userEmail).toBe("permisos_warehouse@example.com");
        });

        it("cambiar el precio de un producto es 403 y el precio no cambia", async () => {
            const producto = await prisma.product.create({ data: { name: "Ratón", price: 25, stock: 3 } });

            const res = await request(app)
                .put(`/api/v1/products/${producto.id}`)
                .set("Cookie", galletas.WAREHOUSE)
                .send({ price: 1 });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe("FORBIDDEN");
            expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).price)).toBe(25);
        });

        it("tampoco puede cancelar la compra que recibió: el PATCH sigue siendo de ADMIN", async () => {
            const orden = await prisma.purchaseOrder.create({ data: { items: { create: [{ productName: "X", quantity: 1, unitPrice: 1 }] } } });

            const res = await request(app)
                .patch(`/api/v1/purchase-orders/${orden.id}`)
                .set("Cookie", galletas.WAREHOUSE)
                .send({ status: "CANCELLED" });

            expect(res.status).toBe(403);
            expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orden.id } })).status).toBe("PENDING");
        });
    });

    describe("POST /sale-orders/:id/ship", () => {
        afterEach(async () => {
            await prisma.saleOrderItem.deleteMany();
            await prisma.saleOrder.deleteMany();
            await prisma.stockMovement.deleteMany();
            await prisma.product.deleteMany();
            await prisma.auditLog.deleteMany();
        });

        async function ventaDe(cantidad: number) {
            const producto = await prisma.product.create({ data: { name: "Monitor", price: 100, stock: 5 } });
            const venta = await request(app)
                .post("/api/v1/sale-orders")
                .set("Cookie", galletas.ADMIN)
                .send({ items: [{ productId: producto.id, productName: "Monitor", quantity: cantidad, unitPrice: 100 }] });
            expect(venta.status).toBe(201);
            return { producto, id: venta.body.data.id as string };
        }

        it("un WAREHOUSE la envía: descuenta el stock, fija la fecha de envío y audita SALE_SHIP", async () => {
            const { producto, id } = await ventaDe(2);

            const res = await request(app).post(`/api/v1/sale-orders/${id}/ship`).set("Cookie", galletas.WAREHOUSE);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe("SHIPPED");
            expect(res.body.data.shippedAt).not.toBeNull();
            expect((await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(3);
            const auditoria = await prisma.auditLog.findFirst({ where: { entityId: id } , orderBy: { createdAt: "desc" } });
            expect(auditoria?.action).toBe("SALE_SHIP");
            expect(auditoria?.userEmail).toBe("permisos_warehouse@example.com");
        });

        it("enviarla dos veces no descuenta dos veces", async () => {
            const { producto, id } = await ventaDe(2);
            await request(app).post(`/api/v1/sale-orders/${id}/ship`).set("Cookie", galletas.WAREHOUSE);

            const res = await request(app).post(`/api/v1/sale-orders/${id}/ship`).set("Cookie", galletas.WAREHOUSE);

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("ORDER_ALREADY_SHIPPED");
            expect((await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(3);
        });

        it("un USER no puede enviarla y la orden sigue pendiente", async () => {
            const { id } = await ventaDe(1);

            const res = await request(app).post(`/api/v1/sale-orders/${id}/ship`).set("Cookie", galletas.USER);

            expect(res.status).toBe(403);
            expect((await prisma.saleOrder.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
        });
    });

    it("un ADMIN puede dar el rol WAREHOUSE, y el listado de usuarios lo filtra", async () => {
        const otro = await createUser({ email: "permisos_futuro_almacen@example.com" });

        const res = await request(app)
            .patch(`/api/v1/users/${otro.id}/role`)
            .set("Cookie", galletas.ADMIN)
            .send({ role: "WAREHOUSE" });
        expect(res.status).toBe(200);
        expect(res.body.data.role).toBe("WAREHOUSE");

        const listado = await request(app).get("/api/v1/users?role=WAREHOUSE").set("Cookie", galletas.ADMIN);
        expect(listado.body.data.data.map((u: { email: string }) => u.email).sort()).toEqual([
            "permisos_futuro_almacen@example.com",
            "permisos_warehouse@example.com",
        ]);
    });
});
