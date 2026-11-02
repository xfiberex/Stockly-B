// Primer administrador de una base recién desplegada (AUD-003).
//
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… [ADMIN_NAME=…] pnpm admin:crear       en desarrollo
//   docker compose exec -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… backend node dist/cli/admin-crear.js
//
// Es lo único que hace: no vacía nada ni siembra datos de demostración, que es lo que hacía el
// seed cuando el despliegue mandaba usarlo. Y sirve **una vez**: si ya hay un ADMIN activo, se
// niega. Los demás se invitan desde **Usuarios**, con su rol (T6-10). Un comando que creara
// administradores siempre sería una puerta trasera para quien tenga la consola.
//
// La contraseña va por variable y no por argumento: así no aparece en la lista de procesos de
// este `node` mientras corre. Cumple la misma regla que el registro.
//
// Sale con 0 si lo creó y con 1 si no, diciendo por qué.

import "dotenv/config";
import { prisma } from "@/shared/lib/prisma";
import { hashPassword } from "@/shared/lib/hash";
import { registerSchema } from "@/modules/auth/auth.validator";
import { auditService } from "@/modules/audit-logs/audit-logs.service";

export const NOMBRE_POR_DEFECTO = "Administrador";

export interface DatosDelAdmin {
    email?: string | undefined;
    password?: string | undefined;
    name?: string | undefined;
}

export async function crearPrimerAdmin(datos: DatosDelAdmin) {
    if (!datos.email || !datos.password) {
        throw new Error("Faltan ADMIN_EMAIL y ADMIN_PASSWORD.");
    }

    const leido = registerSchema.safeParse({
        name: datos.name?.trim() || NOMBRE_POR_DEFECTO,
        email: datos.email,
        password: datos.password,
    });
    if (!leido.success) {
        throw new Error(leido.error.issues.map((i) => i.message).join(". "));
    }
    const { name, email, password } = leido.data;

    // Fuera de la transacción: son 12 rondas de bcrypt con la base esperando.
    const hash = await hashPassword(password);

    const admin = await prisma.$transaction(async (tx) => {
        // Dos ejecuciones a la vez no crean dos: la segunda espera aquí y luego ve al primero.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin:crear'))`;

        const yaHay = await tx.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { email: true } });
        if (yaHay) {
            throw new Error(`Ya hay un administrador (${yaHay.email}). Los demás se invitan desde Usuarios.`);
        }
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
            throw new Error(`Ya existe una cuenta con ${email}. Usa otro correo.`);
        }

        return tx.user.create({
            data: { name, email, password: hash, role: "ADMIN", isVerified: true },
            select: { id: true, name: true, email: true, role: true },
        });
    });

    // Sin actor: no lo hizo ninguna cuenta, sino quien tiene la consola del servidor.
    await auditService.log({}, "CREATE", "User", admin.id, { email: admin.email, role: admin.role, via: "admin:crear" });
    return admin;
}

export async function ejecutar(datos: DatosDelAdmin): Promise<0 | 1> {
    try {
        const admin = await crearPrimerAdmin(datos);
        console.log(`Administrador creado: ${admin.email}. Ya puede iniciar sesión.`);
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        return 1;
    }
}

// Solo al invocar el archivo; importarlo desde un test no crea nada.
if (require.main === module) {
    void ejecutar({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME }).then(
        async (codigo) => {
            await prisma.$disconnect();
            process.exit(codigo);
        },
    );
}
