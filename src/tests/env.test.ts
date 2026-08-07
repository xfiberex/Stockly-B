import { durationToMs, validateEnv } from "@/config/env";

describe("durationToMs", () => {
    it("convierte minutos a ms", () => {
        expect(durationToMs("15m")).toBe(15 * 60 * 1000);
    });

    it("convierte horas a ms", () => {
        expect(durationToMs("1h")).toBe(60 * 60 * 1000);
    });

    it("convierte días a ms", () => {
        expect(durationToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("convierte segundos con sufijo s", () => {
        expect(durationToMs("30s")).toBe(30 * 1000);
    });

    it("interpreta un número sin sufijo como segundos", () => {
        expect(durationToMs("3600")).toBe(3600 * 1000);
    });

    it("ignora espacios alrededor", () => {
        expect(durationToMs("  15m  ")).toBe(15 * 60 * 1000);
    });

    it("lanza error con formato inválido", () => {
        expect(() => durationToMs("abc")).toThrow(/JWT_EXPIRES_IN inválido/);
    });

    it("lanza error con unidad no soportada", () => {
        expect(() => durationToMs("5y")).toThrow();
    });
});

describe("validateEnv", () => {
    const ORIGINAL = { ...process.env };

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            if (!(key in ORIGINAL)) delete process.env[key];
        }
        Object.assign(process.env, ORIGINAL);
    });

    it("no lanza con un entorno de test válido", () => {
        expect(() => validateEnv()).not.toThrow();
    });

    it("lanza si falta una variable requerida", () => {
        delete process.env["JWT_SECRET"];
        expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    });

    it("lanza si DATABASE_URL no es PostgreSQL", () => {
        process.env["DATABASE_URL"] = "mysql://user:pass@localhost:3306/db";
        expect(() => validateEnv()).toThrow(/DATABASE_URL/);
    });

    it("lanza si JWT_SECRET es demasiado corto", () => {
        process.env["JWT_SECRET"] = "corto";
        expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    });

    it("lanza con un NODE_ENV inválido", () => {
        process.env["NODE_ENV"] = "staging";
        expect(() => validateEnv()).toThrow(/NODE_ENV/);
    });

    it("lanza con un PORT fuera de rango", () => {
        process.env["PORT"] = "70000";
        expect(() => validateEnv()).toThrow(/PORT/);
    });

    // T1-26: Cloudinary y SMTP dejan de ser obligatorias para arrancar. El README
    // decía que eran opcionales y `validateEnv()` las exigía: era un bloqueador real
    // de puesta en marcha desde un checkout limpio.
    it("no lanza sin credenciales de Cloudinary ni de SMTP", () => {
        for (const key of [
            "CLOUDINARY_CLOUD_NAME",
            "CLOUDINARY_API_KEY",
            "CLOUDINARY_API_SECRET",
            "SMTP_HOST",
            "SMTP_PORT",
            "SMTP_USER",
            "SMTP_PASS",
            "SMTP_FROM",
        ]) {
            delete process.env[key];
        }
        expect(() => validateEnv()).not.toThrow();
    });

    it("avisa cuando un grupo opcional queda a medias", () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        delete process.env["SMTP_PASS"];

        validateEnv();

        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/smtp.*SMTP_PASS/s));
        warn.mockRestore();
    });

    it("no avisa cuando el grupo está completo", () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

        validateEnv();

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
