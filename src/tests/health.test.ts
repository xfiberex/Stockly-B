import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";

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

// T2-25: `/health` responde 200 mientras el proceso viva —eso es lo que debe hacer una
// sonda de vivacidad—, así que hacía falta otra que dijera si el servicio puede atender
// peticiones de verdad. Sin ella, un orquestador manda tráfico a un backend que va a
// fallar en todas las rutas menos la de salud.
describe("GET /api/v1/ready (T2-25)", () => {
    it("200 cuando la base de datos responde", async () => {
        const res = await request(app).get("/api/v1/ready");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("503 —no 500— cuando la consulta a la base falla", async () => {
        const consulta = jest.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("sin conexión"));

        const res = await request(app).get("/api/v1/ready");

        // 503 dice «aún no disponible» y 500 diría «avería»: es la distinción que usa un
        // orquestador para decidir entre retirar del balanceo y reiniciar.
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ success: false });

        consulta.mockRestore();
    });

    it("`/health` sigue respondiendo 200 aunque la base falle", async () => {
        const consulta = jest.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("sin conexión"));

        // Deliberado: reiniciar el contenedor porque la base esté caída no arregla nada.
        const res = await request(app).get("/api/v1/health");

        expect(res.status).toBe(200);
        consulta.mockRestore();
    });
});
