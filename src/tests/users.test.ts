import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/users";

describe("Users API (panel ADMIN)", () => {
    let admin: { id: string };
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        admin = await createUser({ email: "users_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "users_plain@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /users sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede acceder al panel", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("Listado y filtros", () => {
        it("ADMIN obtiene usuarios paginados con meta", async () => {
            const res = await request(app).get(`${BASE}?page=1&limit=10`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.meta).toMatchObject({ page: 1, limit: 10 });
            expect(Array.isArray(res.body.data.data)).toBe(true);
        });

        it("filtra por rol", async () => {
            const res = await request(app).get(`${BASE}?role=ADMIN`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data.every((u: { role: string }) => u.role === "ADMIN")).toBe(true);
        });

        it("404 al obtener un usuario inexistente", async () => {
            const res = await request(app).get(`${BASE}/nope`).set("Cookie", adminCookie);
            expect(res.status).toBe(404);
        });
    });

    describe("Cambio de rol", () => {
        it("422 con rol inválido", async () => {
            const target = await createUser({ email: "role_target1@example.com", role: "USER" });
            const res = await request(app)
                .patch(`${BASE}/${target.id}/role`)
                .set("Cookie", adminCookie)
                .send({ role: "SUPERADMIN" });
            expect(res.status).toBe(422);
        });

        it("400: no puede cambiar su propio rol", async () => {
            const res = await request(app)
                .patch(`${BASE}/${admin.id}/role`)
                .set("Cookie", adminCookie)
                .send({ role: "USER" });
            expect(res.status).toBe(400);
        });

        it("promueve a otro usuario a ADMIN", async () => {
            const target = await createUser({ email: "role_target2@example.com", role: "USER" });
            const res = await request(app)
                .patch(`${BASE}/${target.id}/role`)
                .set("Cookie", adminCookie)
                .send({ role: "ADMIN" });
            expect(res.status).toBe(200);
            expect(res.body.data.role).toBe("ADMIN");
        });
    });

    describe("Activar / desactivar", () => {
        it("400: no puede desactivar su propia cuenta", async () => {
            const res = await request(app)
                .patch(`${BASE}/${admin.id}/deactivate`)
                .set("Cookie", adminCookie);
            expect(res.status).toBe(400);
        });

        it("desactiva a otro usuario e invalida su refresh token", async () => {
            const target = await createUser({ email: "deact_target@example.com", role: "USER" });
            await prisma.user.update({
                where: { id: target.id },
                data: { refreshToken: "alguntokenhash", refreshExpires: new Date(Date.now() + 1000) },
            });

            const res = await request(app)
                .patch(`${BASE}/${target.id}/deactivate`)
                .set("Cookie", adminCookie);
            expect(res.status).toBe(200);

            const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
            expect(updated.isActive).toBe(false);
            expect(updated.refreshToken).toBeNull();
        });

        it("reactiva a un usuario", async () => {
            const target = await createUser({ email: "react_target@example.com", role: "USER", });
            await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });

            const res = await request(app)
                .patch(`${BASE}/${target.id}/activate`)
                .set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.isActive).toBe(true);
        });
    });
});
