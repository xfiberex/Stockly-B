import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

// T3-02 — la conversión de `users.role` y los dos campos de `audit_logs` a enums nativos.
//
// Lo que se prueba no es que Prisma sepa leer un enum, sino las tres consecuencias que
// tiene el cambio: que la base rechaza por su cuenta un valor inventado, que los filtros
// de la API dejaron de aceptar cualquier cadena, y que `requireRole` sigue funcionando.

describe("Enums de rol y auditoría (T3-02)", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "enums_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "enums_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("La base de datos rechaza valores fuera del enum", () => {
        it("un rol inexistente no se puede escribir ni con SQL crudo", async () => {
            // Se usa SQL crudo a propósito: es la vía que **no** pasa por el `z.enum` de
            // la ruta ni por los tipos de Prisma. Antes de T3-02 la columna era `String`
            // y esto insertaba una cuenta con un rol que `requireRole` no reconoce —sin
            // permisos y sin error visible—. Ahora lo impide la propia base.
            await expect(
                prisma.$executeRawUnsafe(
                    `INSERT INTO users (id, name, email, password, role, "createdAt", "updatedAt")
                     VALUES (gen_random_uuid(), 'Rol inventado', 'enums_rol_malo@example.com', 'x', 'SUPERADMIN', now(), now())`,
                ),
            ).rejects.toThrow(/invalid input value for enum|SUPERADMIN/i);

            const creado = await prisma.user.findUnique({ where: { email: "enums_rol_malo@example.com" } });
            expect(creado).toBeNull();
        });

        it("una acción de auditoría inexistente tampoco entra", async () => {
            await expect(
                prisma.$executeRawUnsafe(
                    `INSERT INTO audit_logs (id, action, entity, "createdAt")
                     VALUES (gen_random_uuid(), 'DROP_TABLE', 'Product', now())`,
                ),
            ).rejects.toThrow(/invalid input value for enum|DROP_TABLE/i);
        });
    });

    describe("Los filtros de la API rechazan lo que la columna ya no admite", () => {
        it("400 con un rol que no existe, en vez de devolver la tabla entera", async () => {
            // El riesgo de ignorar el filtro en silencio: `?role=admin` en minúscula
            // devolvería **todos** los usuarios en lugar de ninguno.
            const res = await request(app).get("/api/v1/users?role=admin").set("Cookie", adminCookie);

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/ADMIN, USER/);
        });

        it("400 con una entidad de auditoría inventada", async () => {
            const res = await request(app).get("/api/v1/audit-logs?entity=Factura").set("Cookie", adminCookie);
            expect(res.status).toBe(400);
        });

        it("los filtros válidos siguen filtrando", async () => {
            const res = await request(app).get("/api/v1/users?role=ADMIN").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data.every((u: { role: string }) => u.role === "ADMIN")).toBe(true);
        });

        it("sin filtro se devuelven los dos roles", async () => {
            const res = await request(app).get("/api/v1/users").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(new Set(res.body.data.data.map((u: { role: string }) => u.role))).toEqual(
                new Set(["ADMIN", "USER"]),
            );
        });

        it("`toString` no se cuela por la cadena de prototipos", async () => {
            // La guarda de `sale-orders` era `status in $Enums.SaleOrderStatus`. Los enums
            // generados son objetos literales, así que heredan de `Object.prototype` y
            // `"toString" in …` es **verdadero**: el valor pasaba la guarda, se casteaba a
            // enum y reventaba dentro de Prisma. Un 500 alcanzable desde la URL.
            const res = await request(app).get("/api/v1/sale-orders?status=toString").set("Cookie", adminCookie);

            expect(res.status).toBe(400);
            expect(res.status).not.toBe(500);
        });
    });

    describe("`requireRole` sigue funcionando con la columna tipada", () => {
        it("un ADMIN entra al panel de usuarios", async () => {
            const res = await request(app).get("/api/v1/users").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
        });

        it("un USER recibe 403", async () => {
            const res = await request(app).get("/api/v1/users").set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });
});
