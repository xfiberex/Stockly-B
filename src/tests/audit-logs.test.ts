import request from "supertest";
import app from "@/app";
import { auditService } from "@/modules/audit-logs";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie, crearProducto, numeroDeVenta, ALMACEN } from "./helpers";
import { registroAuditoriaSchema, actorAuditoriaSchema } from "@/contratos/api";

const BASE = "/api/v1/audit-logs";

describe("Audit Logs API (ADMIN)", () => {
    let adminCookie: string;
    let userCookie: string;
    let adminId: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "audit_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "audit_user@example.com", role: "USER" });
        adminId = admin.id;
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /audit-logs sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede ver la auditoría", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("Listado, filtros y paginación", () => {
        beforeEach(async () => {
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "CREATE", "Product", "p1");
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "DELETE", "Product", "p2");
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "SALE_SHIP", "SaleOrder", "s1");
        });

        it("ADMIN obtiene registros con meta de paginación", async () => {
            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(3);
            expect(res.body.data.data).toHaveLength(3);
        });

        it("filtra por entidad", async () => {
            const res = await request(app).get(`${BASE}?entity=SaleOrder`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.data[0].entity).toBe("SaleOrder");
        });

        it("filtra por acción", async () => {
            const res = await request(app).get(`${BASE}?action=DELETE`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.data[0].action).toBe("DELETE");
        });

        it("respeta el límite por página", async () => {
            const res = await request(app).get(`${BASE}?limit=2`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(2);
            expect(res.body.data.meta.totalPages).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    describe("AUD-017 — a quién o a qué afectó cada fila", () => {
        const filas = async (q = "") =>
            (await request(app).get(`${BASE}${q}`).set("Cookie", adminCookie)).body.data.data as Array<{
                entity: string; entityId: string | null; entityLabel: string | null; entityExists: boolean; action: string;
            }>;

        it("dice el nombre del producto, de la persona y el número de la venta, y encaja en el contrato", async () => {
            const producto = await crearProducto({ data: { name: "Teclado Logitech", price: 10, stock: 1 } });
            const persona = await createUser({ email: "audit_ana@example.com", name: "Ana Pérez", role: "WAREHOUSE" });
            const venta = await prisma.saleOrder.create({
                data: { number: await numeroDeVenta(), warehouseId: ALMACEN, customerName: "Cliente" },
            });
            const ctx = { userId: adminId, userEmail: "audit_admin@example.com" };
            await auditService.log(ctx, "UPDATE", "Product", producto.id);
            await auditService.log(ctx, "USER_ROLE_CHANGE", "User", persona.id, { de: "PENDING", a: "WAREHOUSE" });
            await auditService.log(ctx, "SALE_SHIP", "SaleOrder", venta.id);
            await auditService.log(ctx, "BULK_STOCK", "Product", undefined, { items: 3 });

            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            for (const fila of res.body.data.data) expect(() => registroAuditoriaSchema.parse(fila)).not.toThrow();

            const lista = await filas();
            const de = (entity: string) => lista.find((f) => f.entity === entity && f.entityId !== null)!;
            expect(de("Product")).toMatchObject({ entityLabel: "Teclado Logitech", entityExists: true });
            expect(de("User")).toMatchObject({ entityLabel: "Ana Pérez", entityExists: true });
            // El número con sus ceros, como en pantalla (la interfaz le pone la almohadilla).
            expect(de("SaleOrder").entityLabel).toMatch(/^\d{6}$/);
            // Una acción sobre varios productos no es sobre ninguno: sin etiqueta.
            expect(lista.find((f) => f.action === "BULK_STOCK")).toMatchObject({ entityLabel: null, entityExists: false });
        });

        it("lo que se borra de verdad sigue nombrado: la etiqueta se guarda antes de borrar", async () => {
            const creado = await request(app).post("/api/v1/customers").set("Cookie", adminCookie).send({ name: "Ferretería López" });
            expect(creado.status).toBe(201);
            const borrado = await request(app).delete(`/api/v1/customers/${creado.body.data.id}`).set("Cookie", adminCookie);
            expect(borrado.status).toBe(200);

            const lista = await filas("?entity=Customer");
            expect(lista.find((f) => f.action === "DELETE")).toMatchObject({ entityLabel: "Ferretería López", entityExists: false });
            // La del alta ya no puede leerlo de la tabla, pero tampoco lo inventa.
            expect(lista.find((f) => f.action === "CREATE")).toMatchObject({ entityExists: false });
        });
    });

    // -----------------------------------------------------------------------
    describe("AUD-017 — filtrar por usuario y por día", () => {
        let otroId: string;

        beforeEach(async () => {
            otroId = (await prisma.user.upsert({
                where: { email: "audit_otro@example.com" },
                update: {},
                create: { email: "audit_otro@example.com", name: "Otro", password: "x", role: "ADMIN", isVerified: true },
            })).id;
            // El 5 de octubre de 2026 en Santo Domingo (UTC−4): de 04:00 del 5 a 04:00 del 6, en UTC.
            const en = (iso: string, userId: string, entityId: string) =>
                prisma.auditLog.create({ data: { userId, userEmail: null, action: "UPDATE", entity: "Product", entityId, createdAt: new Date(iso) } });
            await en("2026-10-05T04:00:00Z", adminId, "a-primera-hora");
            await en("2026-10-06T03:30:00Z", adminId, "a-noche"); // 23:30 del 5, hora del negocio
            await en("2026-10-06T04:00:00Z", adminId, "a-dia-6");
            await en("2026-10-05T15:00:00Z", otroId, "otro-dia-5");
        });

        it("un usuario y un día devuelven solo sus filas, con el día de la zona del negocio", async () => {
            const res = await request(app).get(`${BASE}?userId=${adminId}&from=2026-10-05&to=2026-10-05`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data.map((f: { entityId: string }) => f.entityId)).toEqual(["a-noche", "a-primera-hora"]);
            expect(res.body.data.meta.total).toBe(2);
        });

        it("un rango al revés o una fecha que no existe es un 400 con su código", async () => {
            const alReves = await request(app).get(`${BASE}?from=2026-10-06&to=2026-10-05`).set("Cookie", adminCookie);
            const inventada = await request(app).get(`${BASE}?from=2026-02-30`).set("Cookie", adminCookie);

            expect(alReves.status).toBe(400);
            expect(inventada.status).toBe(400);
            expect(inventada.body.code).toBe("INVALID_FILTER_VALUE");
        });

        it("/actors da cada cuenta con registros, con su nombre, y también la que ya no existe", async () => {
            await prisma.auditLog.create({ data: { userId: "00000000-0000-4000-8000-00000000dead", userEmail: "se_fue@example.com", action: "UPDATE", entity: "Product" } });

            const res = await request(app).get(`${BASE}/actors`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            for (const a of res.body.data) expect(() => actorAuditoriaSchema.parse(a)).not.toThrow();
            expect(res.body.data).toEqual(expect.arrayContaining([
                { userId: otroId, name: "Otro", email: "audit_otro@example.com" },
                { userId: "00000000-0000-4000-8000-00000000dead", name: null, email: "se_fue@example.com" },
            ]));
            expect(res.body.data.find((a: { userId: string }) => a.userId === adminId)).toBeDefined();
        });

        it("la exportación lleva los mismos filtros, en CSV y con la etiqueta", async () => {
            const res = await request(app).get(`${BASE}/export?format=csv&userId=${adminId}&from=2026-10-05&to=2026-10-05`).set("Cookie", adminCookie);

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("text/csv");
            const lineas = res.text.replace(/^\uFEFF/, "").split("\n");
            expect(lineas[0]).toBe("createdAt,action,entity,entityId,entityLabel,userEmail,details");
            expect(lineas).toHaveLength(3);
        });

        it("un USER no lee ni la lista de usuarios ni la exportación", async () => {
            expect((await request(app).get(`${BASE}/actors`).set("Cookie", userCookie)).status).toBe(403);
            expect((await request(app).get(`${BASE}/export`).set("Cookie", userCookie)).status).toBe(403);
        });
    });
});
