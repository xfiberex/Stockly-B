import dotenv from "dotenv";
dotenv.config();

const required = [
    "DATABASE_URL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "FRONTEND_URL",
] as const;

const validNodeEnvs = new Set(["development", "test", "production"]);

// Mínimo recomendado OWASP para evitar fuerza bruta sobre el secreto JWT
const MIN_JWT_SECRET_LENGTH = 32;

function isValidDatabaseUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
    } catch {
        return false;
    }
}

function parsePort(value: string | undefined, envName: string, fallback: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`❌ ${envName} debe ser un número entero válido entre 1 y 65535`);
    }
    return parsed;
}

export function validateEnv(): void {
    const missing: string[] = [];

    for (const envVar of required) {
        if (!process.env[envVar]) missing.push(envVar);
    }

    if (missing.length > 0) {
        throw new Error(
            `❌ Variables de entorno no definidas: ${missing.join(", ")}\nConfigura un archivo .env con los valores requeridos antes de iniciar el backend.`,
        );
    }

    if (!process.env["NODE_ENV"]) process.env["NODE_ENV"] = "development";

    if (!validNodeEnvs.has(process.env["NODE_ENV"] as string)) {
        throw new Error("❌ NODE_ENV debe ser development, test o production");
    }

    if (!isValidDatabaseUrl(process.env["DATABASE_URL"] as string)) {
        throw new Error("❌ DATABASE_URL debe ser una URL válida de PostgreSQL (postgresql://user:pass@host:port/db)");
    }

    if ((process.env["JWT_SECRET"] as string).length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`❌ JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres para ser seguro`);
    }

    parsePort(process.env["PORT"], "PORT", 3000);
    parsePort(process.env["SMTP_PORT"], "SMTP_PORT", 587);
}

export const env = {
    port: parseInt(process.env.PORT ?? "3000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: process.env.DATABASE_URL!,
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
        apiKey: process.env.CLOUDINARY_API_KEY!,
        apiSecret: process.env.CLOUDINARY_API_SECRET!,
    },
    jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN!,
    },
    smtp: {
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT!, 10),
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
        from: process.env.SMTP_FROM!,
    },
    frontendUrl: process.env.FRONTEND_URL!,
} as const;
