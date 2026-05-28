import request from "supertest";
import app from "@/app";

describe("GET /api/v1/health", () => {
    it("debe responder 200 con estado OK", async () => {
        const res = await request(app).get("/api/v1/health");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBeDefined();
    });

    it("debe devolver 404 para rutas inexistentes", async () => {
        const res = await request(app).get("/api/v1/ruta-que-no-existe");
        expect(res.status).toBe(404);
    });
});
