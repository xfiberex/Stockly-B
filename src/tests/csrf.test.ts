import request from "supertest";
import app from "@/app";
import { CSRF_COOKIE_NAME } from "@/shared/middlewares/csrf.middleware";

// El middleware CSRF se omite cuando NODE_ENV === "test" (no hay navegador que
// gestione la cookie). Para probarlo, se activa temporalmente el modo development.
describe("Protección CSRF (double-submit)", () => {
    const ORIGINAL_ENV = process.env.NODE_ENV;

    beforeAll(() => {
        process.env.NODE_ENV = "development";
    });

    afterAll(() => {
        process.env.NODE_ENV = ORIGINAL_ENV;
    });

    it("permite métodos seguros (GET) sin token", async () => {
        const res = await request(app).get("/api/v1/health");
        expect(res.status).toBe(200);
    });

    it("no exige token en las rutas de autenticación", async () => {
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "nadie@example.com", password: "Test1234!" });
        // Falla por credenciales (401), pero nunca por CSRF (403)
        expect(res.status).not.toBe(403);
    });

    it("rechaza una petición mutante sin token CSRF", async () => {
        const res = await request(app).post("/api/v1/products").send({ name: "X", price: 1 });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/CSRF/i);
    });

    it("rechaza cuando la cookie y la cabecera CSRF no coinciden", async () => {
        const res = await request(app)
            .post("/api/v1/products")
            .set("Cookie", [`${CSRF_COOKIE_NAME}=aaa`])
            .set("x-csrf-token", "bbb")
            .send({ name: "X", price: 1 });
        expect(res.status).toBe(403);
    });

    it("no bloquea por CSRF cuando cookie y cabecera coinciden", async () => {
        const res = await request(app)
            .post("/api/v1/products")
            .set("Cookie", [`${CSRF_COOKIE_NAME}=match123`])
            .set("x-csrf-token", "match123")
            .send({ name: "X", price: 1 });
        // Pasa CSRF; luego falla por requireAuth (401), pero no por CSRF (403)
        expect(res.status).not.toBe(403);
        expect(res.status).toBe(401);
    });
});
