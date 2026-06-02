import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/tags";

describe("Tags API", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "tags_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "tags_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.tag.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /tags sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede crear etiquetas", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", userCookie)
                .send({ name: "Oferta" });
            expect(res.status).toBe(403);
        });

        it("un USER autenticado sí puede listar etiquetas", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(200);
        });
    });

    describe("CRUD", () => {
        it("crea una etiqueta (201)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Promoción", color: "#ff0000" });
            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ name: "Promoción", color: "#ff0000" });
        });

        it("422 con color hex inválido", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", adminCookie)
                .send({ name: "Mala", color: "rojo" });
            expect(res.status).toBe(422);
        });

        it("409 con nombre duplicado", async () => {
            await request(app).post(BASE).set("Cookie", adminCookie).send({ name: "Única" });
            const res = await request(app).post(BASE).set("Cookie", adminCookie).send({ name: "Única" });
            expect(res.status).toBe(409);
        });

        it("404 al obtener una etiqueta inexistente", async () => {
            const res = await request(app).get(`${BASE}/nope`).set("Cookie", adminCookie);
            expect(res.status).toBe(404);
        });

        it("actualiza una etiqueta", async () => {
            const created = await prisma.tag.create({ data: { name: "Vieja" } });
            const res = await request(app)
                .put(`${BASE}/${created.id}`)
                .set("Cookie", adminCookie)
                .send({ name: "Nueva" });
            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Nueva");
        });

        it("elimina una etiqueta", async () => {
            const created = await prisma.tag.create({ data: { name: "Borrable" } });
            const res = await request(app).delete(`${BASE}/${created.id}`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            const stillThere = await prisma.tag.findUnique({ where: { id: created.id } });
            expect(stillThere).toBeNull();
        });
    });
});
