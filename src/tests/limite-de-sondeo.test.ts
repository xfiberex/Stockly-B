import express from "express";
import request from "supertest";
import { crearLimitadorDeSondeo, crearLimitadorGlobal, RUTA_DEL_SONDEO } from "@/shared/middlewares/rateLimiter.middleware";
import { MONTAJES } from "@/routes";

// T5-12 — el sondeo de la campana no se come el cupo de quien está trabajando.
//
// En `app.ts` el límite global no se monta con `NODE_ENV=test`, así que aquí se montan los dos
// limitadores reales sobre una aplicación mínima, con un techo de 3 para no hacer cien peticiones.

function aplicacion(max: number) {
    const app = express();
    app.use(crearLimitadorGlobal(max));

    const sondeo = crearLimitadorDeSondeo(max);
    app.get(RUTA_DEL_SONDEO, sondeo, (_req, res) => void res.json({ unread: 0 }));
    app.get("/api/v1/products", (_req, res) => void res.json({ data: [] }));
    return app;
}

describe("Límite de peticiones del sondeo de avisos (T5-12)", () => {
    const entorno = process.env.NODE_ENV;

    // Los limitadores se saltan a sí mismos en `test`; aquí hace falta que cuenten.
    beforeAll(() => { process.env.NODE_ENV = "development"; });
    afterAll(() => { process.env.NODE_ENV = entorno; });

    it("sondear no gasta el cupo global: tras muchos sondeos, el resto de la API sigue respondiendo", async () => {
        const app = aplicacion(3);

        for (let i = 0; i < 3; i++) expect((await request(app).get(RUTA_DEL_SONDEO)).status).toBe(200);
        for (let i = 0; i < 3; i++) expect((await request(app).get("/api/v1/products")).status).toBe(200);

        // Y el global sigue existiendo para todo lo demás.
        expect((await request(app).get("/api/v1/products")).status).toBe(429);
    });

    it("el sondeo tiene su propio techo, y al agotarlo responde 429 con su código", async () => {
        const app = aplicacion(3);

        for (let i = 0; i < 3; i++) await request(app).get(RUTA_DEL_SONDEO).expect(200);
        const res = await request(app).get(RUTA_DEL_SONDEO);

        expect(res.status).toBe(429);
        expect(res.body.code).toBe("RATE_LIMITED");
        // Agotar el del sondeo tampoco deja sin servicio al resto.
        expect((await request(app).get("/api/v1/products")).status).toBe(200);
    });

    it("la ruta exenta es la que de verdad está montada", () => {
        // `RUTA_DEL_SONDEO` es una cadena suelta: si alguien renombra la ruta, la exención
        // dejaría de aplicarse sin que nada fallara.
        const [prefijo, router] = MONTAJES.find(([p]) => p === "/notifications")!;
        const rutas = (router as unknown as { stack: Array<{ route?: { path: string } }> }).stack
            .filter((capa) => capa.route)
            .map((capa) => `/api/v1${prefijo}${capa.route!.path}`);

        expect(rutas).toContain(RUTA_DEL_SONDEO);
    });
});
