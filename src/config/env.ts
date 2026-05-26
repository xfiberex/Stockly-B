import dotenv from "dotenv";
dotenv.config();

// Define las variables de entorno requeridas
const required = [
    'DATABASE_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'FRONTEND_URL'
] as const;

// Verifica que todas las variables de entorno requeridas estén definidas
for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Variable(s) de entorno faltante(s): ${key}`);
    }
}

// Exporta las variables de entorno de forma tipada
export const env = {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
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