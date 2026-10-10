// `config/env.ts` llama a `dotenv.config()` al importarse y repondría desde el `.env`
// las variables que estos casos borran a propósito.
jest.mock("dotenv", () => ({ __esModule: true, default: { config: jest.fn() }, config: jest.fn() }));

// T1-26: sin credenciales, el servidor arranca y es la llamada concreta la que falla,
// con un 503 que nombra las variables que faltan. `env` se calcula al importar el
// módulo, así que cada caso reimporta con el entorno ya modificado.
function conEntornoSin(claves: string[], fn: () => Promise<void>): Promise<void> {
    const original = { ...process.env };
    for (const clave of claves) delete process.env[clave];

    return jest.isolateModulesAsync(fn).finally(() => {
        for (const clave of claves) {
            if (original[clave] !== undefined) process.env[clave] = original[clave];
        }
    });
}

const CLAVES_SMTP = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
const CLAVES_CLOUDINARY = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

describe("Servicios opcionales sin configurar", () => {
    it("el envío de correo responde 503 nombrando las variables SMTP", async () => {
        await conEntornoSin(CLAVES_SMTP, async () => {
            const { sendVerificationEmail } = await import("@/shared/lib/nodemailer");

            await expect(sendVerificationEmail("a@example.com", "Ana", "tok", "ES")).rejects.toMatchObject({
                statusCode: 503,
                message: expect.stringContaining("SMTP_HOST"),
            });
            // No se compara con `instanceof HttpError`: `isolateModules` carga una copia
            // distinta del módulo y el constructor no es el mismo objeto.
            await expect(sendVerificationEmail("a@example.com", "Ana", "tok", "ES")).rejects.toMatchObject({
                name: "HttpError",
            });
        });
    });

    // T6-10 — la invitación lo comprueba **antes** de crear la cuenta: creada y sin correo, no
    // se la podría volver a invitar.
    it("sin SMTP, invitar responde 503 y no crea la cuenta", async () => {
        await conEntornoSin(CLAVES_SMTP, async () => {
            const { usersService } = await import("@/modules/users/users.service");
            const { prisma } = await import("@/shared/lib/prisma");
            const email = "invitada_sin_smtp@example.com";
            // Que al final no haya cuenta no basta: también la retira el fallo del envío. Lo que
            // se pide es que no llegue a crearse.
            const crear = jest.spyOn(prisma.user, "create");

            try {
                await expect(usersService.invite({ name: "Ana", email, role: "USER" }, "ES")).rejects.toMatchObject({
                    statusCode: 503,
                    code: "EMAIL_NOT_CONFIGURED",
                });
                expect(crear).not.toHaveBeenCalled();
                expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
            } finally {
                crear.mockRestore();
                await prisma.user.deleteMany({ where: { email } });
                await prisma.$disconnect();
            }
        });
    });

    it("la subida de imágenes responde 503 nombrando las variables de Cloudinary", async () => {
        await conEntornoSin(CLAVES_CLOUDINARY, async () => {
            const { uploadToCloudinary, deleteFromCloudinary } = await import(
                "@/shared/middlewares/upload.middleware"
            );

            await expect(uploadToCloudinary(Buffer.from("x"), "carpeta")).rejects.toMatchObject({
                statusCode: 503,
                message: expect.stringContaining("CLOUDINARY_CLOUD_NAME"),
            });
            await expect(deleteFromCloudinary("id")).rejects.toMatchObject({ statusCode: 503 });
        });
    });

    it("con el entorno completo, `configured` es true en ambos grupos", async () => {
        await jest.isolateModulesAsync(async () => {
            const { env } = await import("@/config/env");
            expect(env.smtp.configured).toBe(true);
            expect(env.cloudinary.configured).toBe(true);
        });
    });
});
