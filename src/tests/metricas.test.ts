import request from "supertest";
import app from "@/app";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * T4-06 — el endpoint de métricas.
 *
 * Lo que se comprueba aquí no es «responde 200»: es que **las etiquetas no exploten**. Una
 * métrica con la URL pedida dentro de la etiqueta crea una serie temporal por cada
 * identificador, y eso convierte la instrumentación en una fuga de memoria que además
 * cualquiera puede provocar desde fuera pidiendo URLs inventadas.
 */
const BASE = "/api/v1";

async function leerMetricas(): Promise<string> {
    const res = await request(app).get(`${BASE}/metrics`);
    expect(res.status).toBe(200);
    return res.text;
}

describe("GET /api/v1/metrics (T4-06)", () => {
    it("expone el formato de Prometheus, con las métricas propias y las del proceso", async () => {
        const res = await request(app).get(`${BASE}/metrics`);

        expect(res.status).toBe(200);
        // El tipo de contenido es parte del contrato: Prometheus lo usa para elegir el
        // analizador, y un `application/json` por descuido deja el raspado en silencio.
        expect(res.headers["content-type"]).toContain("text/plain");

        expect(res.text).toContain("http_requests_total");
        expect(res.text).toContain("http_request_duration_seconds");
        expect(res.text).toContain("http_server_errors_total");

        // De `collectDefaultMetrics`. El retraso del bucle de eventos es la métrica que
        // distingue «la API va lenta» de «la base va lenta», y no se puede escribir a mano.
        expect(res.text).toContain("nodejs_eventloop_lag_seconds");
        expect(res.text).toContain('servicio="stockly-backend"');
    });

    it("etiqueta con la plantilla de la ruta, no con la URL pedida", async () => {
        await cleanDb();
        const admin = await createUser({ email: "metricas@example.com", role: "ADMIN" });
        const cookie = getAuthCookie(admin.id);

        // Identificador inventado: la petición fallará, y da igual. Lo que importa es con
        // qué etiqueta se contabiliza.
        await request(app).get(`${BASE}/products/id-inventado-12345`).set("Cookie", cookie);

        const texto = await leerMetricas();

        expect(texto).toContain('route="/api/v1/products/:id"');
        expect(texto).not.toContain("id-inventado-12345");
    });

    it("agrupa bajo una etiqueta fija lo que no casa con ninguna ruta", async () => {
        // Los escáneres piden esto todo el día. Con la URL en la etiqueta, cada intento
        // sería una serie nueva y la memoria del proceso la marcaría quien quisiera.
        await request(app).get(`${BASE}/wp-login.php`);

        const texto = await leerMetricas();

        expect(texto).toContain('route="desconocida"');
        expect(texto).not.toContain("wp-login");
    });

    it("cuenta también lo que responde antes del router", async () => {
        // Un cuerpo por encima del límite muere en `express.json`, no en una ruta: si el
        // middleware estuviera detrás del router —el sitio donde se pone por intuición—,
        // esto no se contaría.
        const res = await request(app)
            .post(`${BASE}/auth/login`)
            .set("Content-Type", "application/json")
            .send("x".repeat(200 * 1024));

        expect(res.status).toBe(413);

        const texto = await leerMetricas();
        expect(texto).toMatch(/http_requests_total\{[^}]*status="413"/);
    });

    it("mide la duración en el histograma", async () => {
        await request(app).get(`${BASE}/health`);

        const texto = await leerMetricas();

        expect(texto).toMatch(/http_request_duration_seconds_bucket\{[^}]*route="\/api\/v1\/health"/);
        expect(texto).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/health"/);
    });
});

describe("Protección de /metrics (T4-06)", () => {
    // Estos dos casos dependen de variables que se leen al importar `config/env`, así que
    // se recarga el módulo con otro entorno en vez de exponer un ajuste solo para el test.
    const entornoOriginal = { ...process.env };

    afterEach(() => {
        process.env = { ...entornoOriginal };
        jest.resetModules();
    });

    it("con METRICS_TOKEN, exige el token y rechaza el que no vale", async () => {
        process.env.METRICS_TOKEN = "token-de-prueba-largo";
        jest.resetModules();
        const { default: appConToken } = await import("@/app");

        const sin = await request(appConToken).get(`${BASE}/metrics`);
        expect(sin.status).toBe(401);

        const mal = await request(appConToken).get(`${BASE}/metrics`).set("Authorization", "Bearer otro-token-distinto");
        expect(mal.status).toBe(401);

        const bien = await request(appConToken).get(`${BASE}/metrics`).set("Authorization", "Bearer token-de-prueba-largo");
        expect(bien.status).toBe(200);
    });

    it("en producción y sin token configurado, el endpoint no existe", async () => {
        // 404 y no 401: sin token no hay nada que autenticar, y confirmar que la ruta está
        // ahí es media pista regalada. El despliegue que se olvide del token se queda sin
        // métricas —se nota—; el fallo contrario no se notaría nunca.
        process.env.METRICS_TOKEN = "";
        process.env.NODE_ENV = "production";
        jest.resetModules();
        const { default: appProduccion } = await import("@/app");

        const res = await request(appProduccion).get(`${BASE}/metrics`);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ success: false });
    });
});
