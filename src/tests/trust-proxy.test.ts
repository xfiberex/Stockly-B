import request from "supertest";
import type { Express } from "express";
import { parseTrustProxy } from "@/config/env";

/**
 * AUD-002 — de dónde sacan la IP los limitadores.
 *
 * Detrás de nginx, el backend solo ve a nginx. Sin `trust proxy`, todos los clientes caían en
 * el mismo contador y 10 logins fallidos de cualquiera bloqueaban el login del comercio entero.
 *
 * `env` se calcula al importar, así que cada caso reimporta la app con su `TRUST_PROXY`. El
 * limitador del login se salta en `test`: se pasa a `development` solo mientras se pide.
 */
// Cada caso importa la app entera de cero: con la cobertura activa pasa de los 5 s por defecto.
jest.setTimeout(30_000);

const MAX = 3;
const LOGIN = "/api/v1/auth/login";
const CREDENCIALES = { email: "nadie@example.com", password: "Incorrecta1!" };

async function conApp(trustProxy: string | undefined, fn: (app: Express) => Promise<void>): Promise<void> {
    const original = { TRUST_PROXY: process.env.TRUST_PROXY, AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX };
    if (trustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = trustProxy;
    process.env.AUTH_RATE_LIMIT_MAX = String(MAX);

    try {
        await jest.isolateModulesAsync(async () => {
            const { default: app } = await import("@/app");
            process.env.NODE_ENV = "development";
            try {
                await fn(app);
            } finally {
                process.env.NODE_ENV = "test";
            }
        });
    } finally {
        for (const [clave, valor] of Object.entries(original)) {
            if (valor === undefined) delete process.env[clave];
            else process.env[clave] = valor;
        }
    }
}

/** Un login fallido con la cabecera que pondría nginx (o el propio cliente). */
const login = (app: Express, xForwardedFor: string) =>
    request(app).post(LOGIN).set("X-Forwarded-For", xForwardedFor).send(CREDENCIALES);

async function agotarCupo(app: Express, xForwardedFor: string) {
    for (let i = 0; i < MAX; i++) expect((await login(app, xForwardedFor)).status).toBe(401);
    expect((await login(app, xForwardedFor)).status).toBe(429);
}

describe("trust proxy y limitadores (AUD-002)", () => {
    it("con TRUST_PROXY=1, agotar el cupo desde una IP no bloquea el login desde otra", async () => {
        await conApp("1", async (app) => {
            await agotarCupo(app, "203.0.113.1");

            expect((await login(app, "203.0.113.2")).status).toBe(401);
        });
    });

    it("con TRUST_PROXY=1 cuenta el salto que añade nginx, no lo que escribe el cliente delante", async () => {
        await conApp("1", async (app) => {
            // nginx añade la IP real al final (`$proxy_add_x_forwarded_for`). Lo de delante lo
            // pone quien quiera: cambiarlo en cada intento no le da un cupo nuevo.
            for (let i = 0; i < MAX; i++) {
                expect((await login(app, `10.0.0.${i}, 203.0.113.9`)).status).toBe(401);
            }
            expect((await login(app, "10.0.0.99, 203.0.113.9")).status).toBe(429);
        });
    });

    it("sin TRUST_PROXY la cabecera se ignora: un solo contador para todo lo que llega del mismo socket", async () => {
        // El fallo de la auditoría, tal cual: detrás de nginx este sería el comportamiento.
        // Fuera de un proxy es lo correcto, porque la cabecera la escribiría el cliente.
        await conApp(undefined, async (app) => {
            await agotarCupo(app, "203.0.113.1");

            expect((await login(app, "203.0.113.2")).status).toBe(429);
        });
    });
});

describe("parseTrustProxy (AUD-002)", () => {
    it.each([
        [undefined, 0],
        ["", 0],
        ["0", 0],
        ["1", 1],
        [" 2 ", 2],
    ])("%p → %p", (valor, saltos) => {
        expect(parseTrustProxy(valor)).toBe(saltos);
    });

    it.each(["true", "false", "-1", "1.5", "loopback"])("rechaza %p", (valor) => {
        expect(() => parseTrustProxy(valor)).toThrow(/TRUST_PROXY/);
    });
});
