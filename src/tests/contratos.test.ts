import fs from "node:fs";
import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import { $Enums } from "@/generated/prisma/client";
import type { z } from "zod";
import * as contrato from "@/contratos/api";

// Solo el ayudante de formato y las rutas: **este archivo no debe escribir nada**, ver la
// nota del bloque de frescura más abajo.
const { contenidoGenerado, ORIGEN, DESTINO } = require("../../scripts/generar-contratos.js");

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

// T4-01 — el contrato de `src/contratos/api.ts` describe lo que devuelve la API. Este
// archivo comprueba que **eso es verdad**, no que lo parezca:
//
//   1. Los `z.enum` del contrato coinciden con los enums de Prisma.
//   2. Las respuestas **reales** de la API, contra una base viva, encajan en sus esquemas.
//   3. La copia que consume `Stockly-F` está al día.
//
// Sin el punto 2 esto sería otro espejo escrito a mano, que es justo lo que había antes:
// `Stockly-F/src/tests/contratos/esquemas.ts` describía la API de memoria y nada lo ataba
// a ella, así que envejecía en silencio.

/** Valida y devuelve el error legible si falla, en vez de un `false` sin explicación. */
function conforme<T>(esquema: z.ZodType<T>, valor: unknown, que: string): void {
    const resultado = esquema.safeParse(valor);
    if (!resultado.success) {
        throw new Error(`«${que}» no encaja en su contrato:\n${JSON.stringify(resultado.error.issues, null, 2)}`);
    }
}

describe("Contrato de la API (T4-01)", () => {
    describe("los enums del contrato son los de Prisma", () => {
        // La duplicación es deliberada —el contrato solo puede importar `zod`, porque se
        // copia literal al frontend—, así que lo que no puede faltar es esta guarda:
        // añadir un valor al `schema.prisma` sin traerlo aquí rompe la suite.
        const casos: Array<[string, readonly string[], Record<string, string>]> = [
            ["Role", contrato.rolSchema.options, $Enums.Role],
            ["PurchaseOrderStatus", contrato.estadoOrdenCompraSchema.options, $Enums.PurchaseOrderStatus],
            ["SaleOrderStatus", contrato.estadoOrdenVentaSchema.options, $Enums.SaleOrderStatus],
            ["StockMovementType", contrato.tipoMovimientoSchema.options, $Enums.StockMovementType],
            ["AuditAction", contrato.accionAuditoriaSchema.options, $Enums.AuditAction],
            ["AuditEntity", contrato.entidadAuditoriaSchema.options, $Enums.AuditEntity],
        ];

        it.each(casos)("%s", (_nombre, delContrato, dePrisma) => {
            expect([...delContrato].sort()).toEqual(Object.values(dePrisma).sort());
        });
    });

    describe("`aNumero` convierte el importe del cable", () => {
        it.each([
            ["1234.56", 1234.56],
            ["0.00", 0],
            [42, 42],
        ])("%s → %s", (entrada, esperado) => {
            expect(contrato.aNumero(entrada)).toBe(esperado);
        });

        it("un valor no numérico da NaN, como `Number`", () => {
            // No se traduce a 0 a propósito: un cero silencioso en una tabla de inventario
            // se lee como un dato, y un `NaN` como lo que es. `formatearImporte` del
            // frontend lo pinta como «—» por esa misma razón.
            expect(Number.isNaN(contrato.aNumero("no es un precio"))).toBe(true);
        });
    });

    describe("el sobre de respuesta", () => {
        it("envuelve los datos como `{ success, message, data }`", async () => {
            // Correo aleatorio (el que pone `createUser` por defecto) y sin borrado
            // explícito: con un correo fijo, una pasada interrumpida deja el usuario vivo
            // y la siguiente choca contra la restricción de unicidad. La limpieza la hace
            // el `cleanDb` del bloque de abajo.
            const admin = await createUser({ role: "ADMIN" });
            const res = await request(app).get("/api/v1/tags").set("Cookie", getAuthCookie(admin.id));

            conforme(contrato.sobreSchema(contrato.etiquetaSchema.array()), res.body, "sobre de GET /tags");
        });

        it("`data` puede faltar: hay respuestas sin cuerpo útil", () => {
            conforme(
                contrato.sobreSchema(contrato.etiquetaSchema.array()),
                { success: true, message: "Etiqueta eliminada correctamente" },
                "sobre sin data",
            );
        });
    });

    describe("la copia del frontend está al día", () => {
        it("coincide con la fuente byte a byte", () => {
            if (!fs.existsSync(DESTINO)) {
                throw new Error(
                    `Falta la copia del contrato en el frontend (${DESTINO}).\n` +
                        "Ejecuta `pnpm contratos:generar`.",
                );
            }

            const esperado = contenidoGenerado(fs.readFileSync(ORIGEN, "utf8"));
            const actual = fs.readFileSync(DESTINO, "utf8").replace(/\r\n/g, "\n");

            // El mensaje importa: sin él, un fallo aquí parece un problema del frontend.
            expect(actual === esperado ? "al día" : "desfasada — ejecuta `pnpm contratos:generar`").toBe("al día");
        });

        // Aquí hubo un test que llamaba a `generar()` para ejercitar el generador entero.
        // **Se retiró porque se autorreparaba**: con la copia desfasada, el caso de arriba
        // fallaba y este, al ejecutarse después, la reescribía — así que la siguiente
        // pasada salía verde y el aviso desaparecía. Lo vi en carne propia al añadir
        // `errorSchema` al contrato: dos tests en rojo una vez y nunca más, con el archivo
        // ya regenerado por la propia suite.
        //
        // Un guardián que arregla lo que vigila es peor que no tenerlo, y la cobertura que
        // aportaba no vale ese precio. `generar()` se ejercita a mano con
        // `pnpm contratos:generar`, que es su forma de uso real.
    });

    describe("las respuestas reales encajan en sus esquemas", () => {
        let cookieAdmin: string;
        let productoId: string;

        beforeAll(async () => {
            await cleanDb();
            const admin = await createUser({ email: "contrato_admin@test.com", role: "ADMIN" });
            cookieAdmin = getAuthCookie(admin.id);

            const categoria = await prisma.category.create({ data: { name: "Contrato" } });
            const marca = await prisma.brand.create({ data: { name: "Marca de contrato" } });
            const proveedor = await prisma.supplier.create({
                data: { name: "Proveedor de contrato", email: "prov_contrato@test.com" },
            });
            const etiqueta = await prisma.tag.create({ data: { name: "Contrato", color: "#059669" } });

            // `price` con decimales a propósito: es el campo `Decimal` que llega como
            // cadena y el motivo de que `importeSchema` sea una unión.
            const producto = await prisma.product.create({
                data: {
                    name: "Producto de contrato",
                    price: 1234.56,
                    stock: 10,
                    minStock: 2,
                    sku: "CONTRATO-1",
                    categoryId: categoria.id,
                    brandId: marca.id,
                    supplierId: proveedor.id,
                    tags: { connect: { id: etiqueta.id } },
                },
            });
            productoId = producto.id;

            await prisma.stockMovement.create({
                data: { productId: producto.id, type: "IN", delta: 10, stockAfter: 10, note: "alta" },
            });
            await prisma.priceHistory.create({
                data: { productId: producto.id, oldPrice: 1000, newPrice: 1234.56 },
            });

            // Una orden con ítem enlazado y otro suelto: `productId: null` es la
            // distinción de la que depende el recuento de reposición de T2-42.
            await prisma.saleOrder.create({
                data: {
                    customerName: "Cliente",
                    items: {
                        create: [
                            { productId: producto.id, productName: producto.name, quantity: 2, unitPrice: 1234.56 },
                            { productId: null, productName: "Suelto", quantity: 1, unitPrice: 50 },
                        ],
                    },
                },
            });

            await prisma.purchaseOrder.create({
                data: {
                    supplierId: proveedor.id,
                    items: {
                        create: [{ productId: producto.id, productName: producto.name, quantity: 5, unitPrice: 900 }],
                    },
                },
            });

            await prisma.auditLog.create({
                data: { userEmail: admin.email, action: "CREATE", entity: "Product", entityId: producto.id },
            });
        });

        afterAll(async () => {
            await cleanDb();
        });

        it("GET /products — listado paginado", async () => {
            const res = await request(app).get("/api/v1/products").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.paginadoSchema(contrato.productoSchema), res.body.data, "GET /products");
        });

        it("GET /products/:id — el precio llega como cadena, no como número", async () => {
            const res = await request(app).get(`/api/v1/products/${productoId}`).set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.productoSchema, res.body.data, "GET /products/:id");

            // Es el hallazgo que motivó `importeSchema`. Si algún día Prisma o el
            // serializador cambian y esto empieza a llegar como número, quiero enterarme
            // aquí y no por una tabla que pinta «$NaN».
            expect(typeof res.body.data.price).toBe("string");
        });

        it("GET /products/:id/movements", async () => {
            const res = await request(app)
                .get(`/api/v1/products/${productoId}/movements`)
                .set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            // T4-15: se comprueba la respuesta **entera**, no sus dos mitades por separado.
            // Antes se validaban `product` y `movements` sueltos, así que el `meta` nuevo
            // podría faltar y el test seguiría en verde — que es como se documenta una
            // respuesta que ya no existe.
            conforme(contrato.movimientosDeProductoSchema, res.body.data, "movements");
        });

        it("GET /products/:id/price-history", async () => {
            const res = await request(app)
                .get(`/api/v1/products/${productoId}/price-history`)
                .set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.historialPrecioSchema.array(), res.body.data.history, "price-history.history");
        });

        it("GET /products/export — la fila de exportación", async () => {
            const res = await request(app).get("/api/v1/products/export").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            const filas = Array.isArray(res.body) ? res.body : res.body.data;
            conforme(contrato.productoExportadoSchema.array(), filas, "GET /products/export");
        });

        it("GET /sale-orders — con ítem enlazado y suelto", async () => {
            const res = await request(app).get("/api/v1/sale-orders").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.paginadoSchema(contrato.ordenVentaSchema), res.body.data, "GET /sale-orders");

            const items = res.body.data.data[0].items;
            expect(items.some((i: { productId: string | null }) => i.productId === null)).toBe(true);
        });

        it("GET /purchase-orders", async () => {
            const res = await request(app).get("/api/v1/purchase-orders").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.paginadoSchema(contrato.ordenCompraSchema), res.body.data, "GET /purchase-orders");
        });

        it("GET /users", async () => {
            const res = await request(app).get("/api/v1/users").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.paginadoSchema(contrato.usuarioSchema), res.body.data, "GET /users");
        });

        it("GET /auth/me — el perfil no trae `updatedAt`", async () => {
            const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.perfilSchema, res.body.data, "GET /auth/me");
        });

        it("GET /settings — el valor booleano es booleano, no la cadena «false»", async () => {
            const res = await request(app).get("/api/v1/settings").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.ajusteSchema.array(), res.body.data, "GET /settings");

            // El defecto literal de T1-06: `"false"` es una cadena verdadera y el
            // interruptor se pintaba apagado con el ajuste encendido.
            const booleano = res.body.data.find((a: { type: string }) => a.type === "boolean");
            expect(typeof booleano.value).toBe("boolean");
        });

        it("GET /audit-logs", async () => {
            const res = await request(app).get("/api/v1/audit-logs").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.paginadoSchema(contrato.registroAuditoriaSchema), res.body.data, "GET /audit-logs");
        });

        it("GET /reports — aquí los importes SÍ son números", async () => {
            const res = await request(app).get("/api/v1/reports").set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            conforme(contrato.resumenReporteSchema, res.body.data, "GET /reports");

            // La excepción documentada en el contrato: `reports.service.ts` convierte con
            // `Number(...)` antes de responder, al revés que `/products`.
            expect(typeof res.body.data.topByValue[0].price).toBe("number");
        });

        /** Los cuatro catálogos responden lista suelta o paginada según el módulo. */
        async function listaDe(ruta: string): Promise<unknown> {
            const res = await request(app).get(`/api/v1/${ruta}`).set("Cookie", cookieAdmin);

            expect(res.status).toBe(200);
            return Array.isArray(res.body.data) ? res.body.data : res.body.data.data;
        }

        it("GET /categories", async () => {
            conforme(contrato.categoriaSchema.array(), await listaDe("categories"), "GET /categories");
        });

        it("GET /brands", async () => {
            conforme(contrato.marcaSchema.array(), await listaDe("brands"), "GET /brands");
        });

        it("GET /suppliers", async () => {
            conforme(contrato.proveedorSchema.array(), await listaDe("suppliers"), "GET /suppliers");
        });

        it("GET /tags", async () => {
            conforme(contrato.etiquetaSchema.array(), await listaDe("tags"), "GET /tags");
        });
    });
});
