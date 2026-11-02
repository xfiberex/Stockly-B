/**
 * AUD-003 — cuándo se niega a correr el seed.
 *
 * `prisma/seed.ts` **vacía la base** y siembra cuentas con contraseñas que están escritas en el
 * README (`admin@stockly.app` / `Admin1234!`). Contra una base de verdad son dos desastres a la
 * vez: se pierde todo y quedan administradores que cualquiera puede usar. Y nada lo impedía: el
 * README de despliegue llegó a mandar ejecutarlo.
 *
 * Se niega con `NODE_ENV=production` y con cualquier base que no esté en esta máquina. Lo
 * segundo cubre el caso que lo primero no ve: un `.env` de desarrollo apuntado, por descuido, a
 * la base del servidor. `--forzar` lo salta, para quien sepa lo que hace (una base de
 * demostración en otra máquina).
 *
 * Vive en `src/` y no en `prisma/` para que la cuenten los tests y la cobertura.
 */

export const FORZAR = "--forzar";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Si la base de `DATABASE_URL` está en esta máquina. Una URL que no se entiende, no. */
export function esBaseLocal(databaseUrl: string | undefined): boolean {
    if (!databaseUrl) return false;
    try {
        return HOSTS_LOCALES.has(new URL(databaseUrl).hostname.toLowerCase());
    } catch {
        return false;
    }
}

/** Por qué no se debe sembrar, o `null` si se puede. */
export function motivoParaNoSembrar(entorno: {
    nodeEnv: string | undefined;
    databaseUrl: string | undefined;
    argv: readonly string[];
}): string | null {
    if (entorno.argv.includes(FORZAR)) return null;

    if (entorno.nodeEnv === "production") {
        return "NODE_ENV=production. El seed vacía la base y crea cuentas con contraseñas públicas.";
    }
    if (!esBaseLocal(entorno.databaseUrl)) {
        return "DATABASE_URL no apunta a esta máquina. El seed vacía la base y crea cuentas con contraseñas públicas.";
    }
    return null;
}
