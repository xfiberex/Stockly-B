import path from "node:path";
import { spawnSync } from "node:child_process";
import { prisma } from "@/shared/lib/prisma";
import { comparePassword } from "@/shared/lib/hash";
import { FORZAR, esBaseLocal, motivoParaNoSembrar } from "@/shared/lib/guardaDelSeed";
import { NOMBRE_POR_DEFECTO, crearPrimerAdmin, ejecutar } from "@/cli/admin-crear";
import { cleanDb, createUser } from "./helpers";

/**
 * AUD-003 — el despliegue documentado mandaba ejecutar el seed, que vacía la base y deja
 * administradores con la contraseña del README. Ahora el seed se niega fuera de una base local
 * y el primer administrador sale de `pnpm admin:crear`, que no toca nada más.
 */

const RAIZ = path.resolve(__dirname, "../..");
const BUENA = "Primera1234!";

describe("guarda del seed (AUD-003)", () => {
    it.each([
        ["postgresql://u:p@localhost:5432/Stockly", true],
        ["postgresql://u:p@127.0.0.1:5433/Stockly_test", true],
        ["postgresql://u:p@[::1]:5432/Stockly", true],
        ["postgresql://u:p@LOCALHOST/Stockly", true],
        ["postgresql://u:p@db:5432/Stockly", false],
        ["postgresql://u:p@stockly.example.com:5432/Stockly", false],
        ["postgresql://u:p@localhost.example.com/Stockly", false],
        ["no es una url", false],
        [undefined, false],
    ])("esBaseLocal(%p) → %p", (url, esperado) => {
        expect(esBaseLocal(url)).toBe(esperado);
    });

    const LOCAL = "postgresql://u:p@localhost:5432/Stockly";
    const REMOTA = "postgresql://u:p@stockly.example.com:5432/Stockly";

    it("deja sembrar una base local fuera de producción", () => {
        expect(motivoParaNoSembrar({ nodeEnv: "development", databaseUrl: LOCAL, argv: [] })).toBeNull();
    });

    it("se niega con NODE_ENV=production, aunque la base sea local", () => {
        expect(motivoParaNoSembrar({ nodeEnv: "production", databaseUrl: LOCAL, argv: [] })).toMatch(/NODE_ENV=production/);
    });

    it("se niega con una base que no está en esta máquina, aunque no sea producción", () => {
        expect(motivoParaNoSembrar({ nodeEnv: "development", databaseUrl: REMOTA, argv: [] })).toMatch(/DATABASE_URL/);
    });

    it(`${FORZAR} lo salta`, () => {
        expect(motivoParaNoSembrar({ nodeEnv: "production", databaseUrl: REMOTA, argv: ["node", "seed.ts", FORZAR] })).toBeNull();
    });

    it("con NODE_ENV=production, el seed de verdad sale con error y no toca la base", async () => {
        await cleanDb();
        const superviviente = await createUser({ email: "sigo-aqui@example.com" });

        // El seed real, como lo lanza `prisma db seed`, contra la base de los tests.
        const tsx = require.resolve("tsx/cli", { paths: [RAIZ] });
        const salida = spawnSync(process.execPath, [tsx, "prisma/seed.ts"], {
            cwd: RAIZ,
            env: { ...process.env, NODE_ENV: "production" },
            encoding: "utf8",
            timeout: 60_000,
        });

        expect(salida.status).toBe(1);
        expect(salida.stderr).toContain("No se siembra");
        expect(salida.stdout).not.toContain("Base de datos limpiada");
        expect(await prisma.user.findUnique({ where: { id: superviviente.id } })).not.toBeNull();
        expect(await prisma.user.count()).toBe(1);
    }, 60_000);
});

describe("pnpm admin:crear (AUD-003)", () => {
    beforeEach(async () => {
        await cleanDb();
    });

    it("en una base vacía crea un ADMIN verificado, con la contraseña hasheada, y lo audita", async () => {
        const admin = await crearPrimerAdmin({ email: "  Duena@Comercio.example ", password: BUENA, name: "Ana Duarte" });

        expect(admin).toMatchObject({ name: "Ana Duarte", email: "duena@comercio.example", role: "ADMIN" });
        const guardado = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
        expect(guardado).toMatchObject({ role: "ADMIN", isVerified: true, isActive: true });
        expect(guardado.password).not.toBe(BUENA);
        expect(await comparePassword(BUENA, guardado.password)).toBe(true);

        const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entityId: admin.id } });
        expect(auditoria).toMatchObject({ action: "CREATE", entity: "User", userId: null });
        expect(auditoria.details).toMatchObject({ via: "admin:crear" });
    });

    it("sin nombre, se llama «Administrador»", async () => {
        const admin = await crearPrimerAdmin({ email: "a@example.com", password: BUENA });
        expect(admin.name).toBe(NOMBRE_POR_DEFECTO);
    });

    it("no vacía nada: lo que ya había sigue ahí", async () => {
        const otro = await createUser({ email: "consulta@example.com", role: "USER" });
        await prisma.category.create({ data: { name: "Bebidas" } });

        await crearPrimerAdmin({ email: "a@example.com", password: BUENA });

        expect(await prisma.user.findUnique({ where: { id: otro.id } })).not.toBeNull();
        expect(await prisma.category.count()).toBe(1);
    });

    it("se niega si ya hay un ADMIN activo, y no crea nada", async () => {
        await createUser({ email: "ya-admin@example.com", role: "ADMIN" });

        await expect(crearPrimerAdmin({ email: "otro@example.com", password: BUENA })).rejects.toThrow(
            "Ya hay un administrador (ya-admin@example.com).",
        );
        expect(await prisma.user.count()).toBe(1);
    });

    it("un ADMIN desactivado no cuenta: se puede crear otro", async () => {
        const viejo = await createUser({ email: "baja@example.com", role: "ADMIN" });
        await prisma.user.update({ where: { id: viejo.id }, data: { isActive: false } });

        await expect(crearPrimerAdmin({ email: "nuevo@example.com", password: BUENA })).resolves.toMatchObject({ role: "ADMIN" });
    });

    it("se niega con un correo que ya tiene cuenta", async () => {
        await createUser({ email: "pendiente@example.com", role: "PENDING" });

        // El mensaje entero, con el correo ya puesto: el error de Prisma cita el código fuente de
        // alrededor, plantilla incluida, y un `/Ya existe una cuenta/` pasaba sin la comprobación.
        await expect(crearPrimerAdmin({ email: "pendiente@example.com", password: BUENA })).rejects.toThrow(
            "Ya existe una cuenta con pendiente@example.com. Usa otro correo.",
        );
        expect(await prisma.user.findUniqueOrThrow({ where: { email: "pendiente@example.com" } })).toMatchObject({ role: "PENDING" });
    });

    it.each([
        [{ password: BUENA }, /ADMIN_EMAIL/],
        [{ email: "a@example.com" }, /ADMIN_PASSWORD/],
        [{ email: "no-es-un-correo", password: BUENA }, /correo/],
        [{ email: "a@example.com", password: "corta1A" }, /8 caracteres/],
        [{ email: "a@example.com", password: "sinmayuscula1" }, /mayúscula/],
    ])("rechaza %p sin crear nada", async (datos, mensaje) => {
        await expect(crearPrimerAdmin(datos)).rejects.toThrow(mensaje);
        expect(await prisma.user.count()).toBe(0);
    });

    it("dos ejecuciones a la vez crean un solo ADMIN: la segunda espera al cerrojo y ve a la primera", async () => {
        // Lanzarlas a la vez no basta: las consultas son tan cortas que casi nunca se solapan y el
        // test pasaba sin cerrojo. Aquí la «primera» es una transacción del test que lo retiene.
        let soltar!: () => void;
        const retenido = new Promise<void>((r) => (soltar = r));
        let cogido!: () => void;
        const cerrojoCogido = new Promise<void>((r) => (cogido = r));

        const primera = prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin:crear'))`;
            cogido();
            await retenido;
            await tx.user.create({ data: { name: "Primera", email: "uno@example.com", password: "x", role: "ADMIN", isVerified: true } });
        }, { timeout: 15_000 });
        await cerrojoCogido;

        const segunda = crearPrimerAdmin({ email: "dos@example.com", password: BUENA });
        const resultado = await Promise.race([segunda.then(() => "terminó", () => "terminó"), new Promise((r) => setTimeout(() => r("espera"), 1_000))]);
        expect(resultado).toBe("espera");

        soltar();
        await primera;
        await expect(segunda).rejects.toThrow("Ya hay un administrador (uno@example.com).");
        expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
    });

    it("ejecutar sale con 0 al crearlo y con 1, diciendo por qué, al negarse", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const error = jest.spyOn(console, "error").mockImplementation(() => {});

        expect(await ejecutar({ email: "a@example.com", password: BUENA })).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("a@example.com"));

        expect(await ejecutar({ email: "b@example.com", password: BUENA })).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("Ya hay un administrador"));
    });
});
