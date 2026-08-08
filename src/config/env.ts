import dotenv from "dotenv";
dotenv.config();

// Imprescindibles: sin ellas el servidor no puede arrancar de forma útil.
const required = ["DATABASE_URL", "JWT_SECRET", "JWT_EXPIRES_IN", "FRONTEND_URL"] as const;

// Opcionales por grupo: su ausencia no impide arrancar, solo desactiva una función
// concreta, que falla con un mensaje explícito cuando se invoca. Antes estaban en
// `required` y bloqueaban la puesta en marcha desde un checkout limpio.
const optionalGroups = {
    cloudinary: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
} as const;

function groupIsConfigured(group: keyof typeof optionalGroups): boolean {
    return optionalGroups[group].every((name) => Boolean(process.env[name]));
}

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

// Convierte una duración estilo jsonwebtoken ("15m", "7d", "3600", "1h") a milisegundos.
// Permite derivar el maxAge de la cookie del mismo JWT_EXPIRES_IN (una sola fuente de verdad).
export function durationToMs(value: string): number {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) * 1000; // segundos
    const match = /^(\d+)\s*(s|m|h|d)$/.exec(trimmed);
    if (!match) {
        throw new Error(`❌ JWT_EXPIRES_IN inválido: "${value}". Usa formatos como 15m, 1h, 7d o segundos.`);
    }
    const amount = parseInt(match[1]!, 10);
    const unit = match[2] as "s" | "m" | "h" | "d";
    const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return amount * factor;
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

    // Un grupo a medias casi siempre es un despiste, no una decisión: se avisa.
    for (const group of Object.keys(optionalGroups) as Array<keyof typeof optionalGroups>) {
        const faltan = optionalGroups[group].filter((name) => !process.env[name]);
        if (faltan.length > 0 && faltan.length < optionalGroups[group].length) {
            console.warn(
                `⚠️  Configuración de ${group} incompleta: faltan ${faltan.join(", ")}. La función quedará desactivada.`,
            );
        }
    }
}

export const env = {
    port: parseInt(process.env.PORT ?? "3000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    // Techo global de peticiones por IP cada 15 min. Configurable para el E2E.
    rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX ?? "", 10) || 100,
    // Nivel de log (T2-10). En los tests el valor por defecto es `silent` para no
    // ensuciar la salida del suite; los que comprueban el log lo suben a mano.
    logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    databaseUrl: process.env.DATABASE_URL!,
    cloudinary: {
        // `configured` distingue «no hay credenciales» de «las credenciales fallan».
        configured: groupIsConfigured("cloudinary"),
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN!,
        // Derivado: duración del access token en ms, reutilizado por el maxAge de la cookie.
        expiresInMs: durationToMs(process.env.JWT_EXPIRES_IN ?? "15m"),
    },
    smtp: {
        configured: groupIsConfigured("smtp"),
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
    },
    frontendUrl: process.env.FRONTEND_URL!,
} as const;
