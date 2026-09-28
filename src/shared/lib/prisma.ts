import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/config/env";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    max: 10,
    // En los tests, un segundo. Jest da a cada archivo su propio contexto, así que cada uno
    // crea su cliente y su pool, y las conexiones del archivo anterior seguían abiertas los
    // 30 s de inactividad: con 48 archivos en ~40 s se acumulaban hasta el `max_connections`
    // de 100 de PostgreSQL, y la suite fallaba con «demasiados clientes» (T5-09, al añadir
    // un archivo que lanza cinco consultas a la vez).
    idleTimeoutMillis: process.env.NODE_ENV === "test" ? 1_000 : 30_000,
    connectionTimeoutMillis: 5_000,
});

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export { Prisma } from "@/generated/prisma/client";