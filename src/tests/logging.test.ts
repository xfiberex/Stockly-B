import request from "supertest";
import type { Express } from "express";

/**
 * T2-10 — logging estructurado con correlación de peticiones.
 *
 * El criterio de aceptación no es «se registra algo»: es que **dado el
 * `x-request-id` de una respuesta se puedan recuperar todas sus líneas de log**.
 * Eso no se comprueba mirando el código, así que estos tests capturan la salida
 * real de pino interceptando `process.stdout.write` y buscan en ella el mismo
 * identificador que viajó en la cabecera.
 *
 * El nivel por defecto en tests es `silent` (ver `config/env.ts`), de ahí el
 * `LOG_LEVEL` explícito y el `isolateModules`: el logger lee el entorno al
 * importarse.
 */
interface Registro {
    level?: string;
    time?: string;
    msg?: string;
    req?: { id?: string };
    [clave: string]: unknown;
}

/** El identificador de la petición viaja dentro del serializador `req` de pino-http. */
const idDe = (linea: Registro) => linea.req?.id;

/**
 * `pino-http` escribe al cerrarse la respuesta, que ocurre **después** de que
 * supertest resuelva su promesa. Sin esta espera el test lee el buffer vacío y
 * parece que no se registra nada — que es exactamente el falso negativo que me
 * hizo perder el primer intento.
 */
const dejarQueEscriba = () => new Promise((r) => setTimeout(r, 50));

async function conAppRegistrando<T>(
    fn: (app: Express, lineas: () => Registro[]) => Promise<T>,
): Promise<T> {
    const previo = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";

    const capturado: string[] = [];
    const escribirReal = process.stdout.write.bind(process.stdout);
    const spy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array, ...resto: unknown[]) => {
            capturado.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
            // Solo se secuestran las líneas de pino; lo demás sigue saliendo por consola.
            const texto = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
            if (!texto.trimStart().startsWith("{")) {
                return (escribirReal as (...a: unknown[]) => boolean)(chunk, ...resto);
            }
            return true;
        });

    const lineas = () =>
        capturado
            .join("")
            .split("\n")
            .filter((l) => l.trim().startsWith("{"))
            .map((l) => JSON.parse(l) as Registro);

    try {
        let resultado!: T;
        await jest.isolateModulesAsync(async () => {
            const { default: app } = await import("@/app");
            resultado = await fn(app, lineas);
        });
        return resultado;
    } finally {
        spy.mockRestore();
        if (previo === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = previo;
    }
}

describe("Logging estructurado y correlación (T2-10)", () => {
    it("toda respuesta lleva un x-request-id", async () => {
        await conAppRegistrando(async (app) => {
            const res = await request(app).get("/api/v1/health");
            expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
        });
    });

    it("dos peticiones no comparten identificador", async () => {
        await conAppRegistrando(async (app) => {
            const a = await request(app).get("/api/v1/health");
            const b = await request(app).get("/api/v1/health");
            expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
        });
    });

    it("respeta el identificador que ya viene en la cabecera", async () => {
        await conAppRegistrando(async (app) => {
            const res = await request(app)
                .get("/api/v1/health")
                .set("x-request-id", "traza-de-otro-servicio");
            expect(res.headers["x-request-id"]).toBe("traza-de-otro-servicio");
        });
    });

    it("el log sale en JSON, con el nivel como palabra y no como número", async () => {
        await conAppRegistrando(async (app, lineas) => {
            await request(app).get("/api/v1/health");
            await dejarQueEscriba();

            const registro = lineas().at(-1)!;
            expect(registro.level).toBe("info");
            expect(typeof registro.time).toBe("string");
            expect(idDe(registro)).toBeTruthy();
        });
    });

    // El criterio, literal: con el identificador de una respuesta en la mano,
    // sus líneas de log se encuentran.
    it("las líneas de una petición se recuperan por su x-request-id", async () => {
        await conAppRegistrando(async (app, lineas) => {
            const res = await request(app).get("/api/v1/health");
            await dejarQueEscriba();
            const id = res.headers["x-request-id"];

            const suyas = lineas().filter((l) => idDe(l) === id);
            expect(suyas.length).toBeGreaterThan(0);
            expect(suyas.every((l) => idDe(l) === id)).toBe(true);
        });
    });

    it("una petición rechazada se registra como aviso, no como error", async () => {
        await conAppRegistrando(async (app, lineas) => {
            // Sin sesión: 401. Es un cliente equivocado, no una avería del servidor.
            const res = await request(app).get("/api/v1/products");
            expect(res.status).toBe(401);
            await dejarQueEscriba();

            const suyas = lineas().filter((l) => idDe(l) === res.headers["x-request-id"]);
            expect(suyas.length).toBeGreaterThan(0);
            expect(suyas.some((l) => l.level === "warn")).toBe(true);
            expect(suyas.some((l) => l.level === "error")).toBe(false);
        });
    });

    // pino-http recibe el `req` ya reescrito por el router: sin `originalUrl`, todas
    // las líneas decían «GET /» y el log no servía para saber qué se había pedido.
    it("el mensaje lleva la ruta que pidió el cliente, no la reescrita por el router", async () => {
        await conAppRegistrando(async (app, lineas) => {
            const res = await request(app).get("/api/v1/products");
            await dejarQueEscriba();

            const suya = lineas().find((l) => idDe(l) === res.headers["x-request-id"])!;
            expect(suya.msg).toBe("GET /api/v1/products → 401");
        });
    });

    it("no registra la cookie de sesión ni la cabecera de autorización", async () => {
        await conAppRegistrando(async (app, lineas) => {
            const res = await request(app)
                .get("/api/v1/products")
                .set("Cookie", "token=secreto-que-no-debe-aparecer")
                .set("Authorization", "Bearer otro-secreto");

            await dejarQueEscriba();
            const texto = JSON.stringify(lineas().filter((l) => idDe(l) === res.headers["x-request-id"]));
            expect(texto).not.toContain("secreto-que-no-debe-aparecer");
            expect(texto).not.toContain("otro-secreto");
        });
    });
});
