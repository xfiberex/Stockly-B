import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { hashPassword, comparePassword } from "@/shared/lib/hash";
import { generateToken, hashToken } from "@/shared/lib/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/shared/lib/nodemailer";
import { auditService } from "@/modules/audit-logs";

export const authService = {
    async register(email: string, password: string, name: string) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) throw new HttpError(409, "El correo ya está registrado", "EMAIL_ALREADY_REGISTERED");

        const hashed = await hashPassword(password);
        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // El registro público SIEMPRE crea usuarios con rol USER. Antes el primero
        // se convertía en ADMIN, lo que en un despliegue sin seed regalaba el panel
        // de administración al primer visitante que pasara por la página de registro
        // — y con una carrera de propina: dos registros simultáneos leían ambos
        // `count() === 0` y salían los dos ADMIN. El administrador inicial se crea
        // por seed (`prisma/seed.ts`), que es explícito y no depende de quién llegue
        // antes. Para promover a alguien está `PATCH /users/:id/role`.
        await prisma.user.create({
            data: {
                name,
                email,
                password: hashed,
                role: "USER",
                verifyToken: hash,
                verifyExpires: expires,
            },
        });

        await sendVerificationEmail(email, name, raw);
    },

    async verifyEmail(rawToken: string) {
        const hash = hashToken(rawToken);
        const user = await prisma.user.findFirst({ where: { verifyToken: hash } });

        if (!user || !user.verifyExpires || user.verifyExpires < new Date()) {
            throw new HttpError(400, "Token inválido o expirado", "INVALID_OR_EXPIRED_TOKEN");
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verifyToken: null, verifyExpires: null },
        });
    },

    async resendVerification(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.isVerified) throw new HttpError(400, "Cuenta no encontrada o ya verificada", "ACCOUNT_NOT_FOUND_OR_VERIFIED");

        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { verifyToken: hash, verifyExpires: expires },
        });

        await sendVerificationEmail(email, user.name ?? "Usuario", raw);
    },

    async login(email: string, password: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) throw new HttpError(401, "Credenciales inválidas", "INVALID_CREDENTIALS");

        const valid = await comparePassword(password, user.password);
        if (!valid) throw new HttpError(401, "Credenciales inválidas", "INVALID_CREDENTIALS");

        if (!user.isActive) throw new HttpError(403, "Tu cuenta ha sido desactivada. Contacta al administrador", "ACCOUNT_DISABLED");
        if (!user.isVerified) throw new HttpError(403, "Confirma tu correo antes de iniciar sesión", "EMAIL_NOT_CONFIRMED");

        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            // Un inicio de sesión empieza una familia nueva, así que el «anterior» se
            // limpia: arrastrarlo dejaría un hash de la sesión pasada capaz de disparar
            // la alarma de reuso de T2-31 sin que nadie haya robado nada.
            data: { refreshToken: hash, previousRefreshToken: null, refreshExpires: expires },
        });

        return { user, rawRefreshToken: raw };
    },

    async refresh(rawToken: string) {
        const hash = hashToken(rawToken);
        const user = await prisma.user.findFirst({ where: { refreshToken: hash } });

        if (!user) {
            // T2-31 — reuso de un token ya rotado.
            //
            // Antes esto era indistinguible de una sesión caducada: un 401 y a otra cosa.
            // Pero un token que **ya se gastó** y vuelve a aparecer solo tiene una
            // explicación razonable: alguien se hizo con él. Y como la rotación ya le
            // entregó uno nuevo al ladrón o a la víctima, seguir adelante deja al atacante
            // con una sesión válida indefinidamente.
            //
            // La respuesta es cerrar la familia entera: se anulan los dos hashes, así que
            // el token que esté en circulación —el legítimo incluido— deja de servir y
            // ambos tienen que volver a autenticarse. Es agresivo a propósito; el usuario
            // legítimo pierde la sesión, que es mucho menos que perder la cuenta.
            const reutilizado = await prisma.user.findFirst({ where: { previousRefreshToken: hash } });

            if (reutilizado) {
                await prisma.user.update({
                    where: { id: reutilizado.id },
                    data: { refreshToken: null, previousRefreshToken: null, refreshExpires: null },
                });

                // Sin actor: quien llega aquí no está autenticado, y el usuario cuya
                // sesión se cierra no es quien hizo la petición. El registro guarda a
                // quién le pasó, que es lo que hace falta para investigarlo después.
                await auditService.log(
                    { userId: reutilizado.id, userEmail: reutilizado.email },
                    "REFRESH_REUSE",
                    "User",
                    reutilizado.id,
                    { motivo: "Se presentó un refresh token ya rotado; se cerraron todas las sesiones" },
                );
            }

            throw new HttpError(401, "Sesión expirada, inicia sesión nuevamente", "SESSION_EXPIRED");
        }

        if (!user.refreshExpires || user.refreshExpires < new Date()) {
            throw new HttpError(401, "Sesión expirada, inicia sesión nuevamente", "SESSION_EXPIRED");
        }

        // Defensa en profundidad: `setActive(false)` ya anula el refresh token
        // (`users.service.ts`), pero comprobarlo aquí cubre cualquier otra vía de
        // desactivación —una edición directa en base de datos, un flujo futuro— sin
        // depender de que esa otra vía se acuerde de limpiar el token.
        if (!user.isActive) {
            throw new HttpError(401, "Sesión expirada, inicia sesión nuevamente", "SESSION_EXPIRED");
        }

        // Rotación: el token anterior queda inválido, se emite uno nuevo
        const { raw, hash: newHash } = generateToken();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            // El hash que se acaba de gastar se guarda como «anterior»: es lo que permite
            // reconocerlo si vuelve a presentarse (T2-31).
            data: { refreshToken: newHash, previousRefreshToken: hash, refreshExpires: expires },
        });

        return { user, rawRefreshToken: raw };
    },

    async revokeRefreshToken(rawToken: string) {
        const hash = hashToken(rawToken);
        await prisma.user.updateMany({
            where: { refreshToken: hash },
            // También el anterior: si al cerrar sesión se dejara vivo, un token ya rotado
            // seguiría disparando la alarma de reuso de T2-31 mucho después, sobre una
            // sesión que el propio usuario cerró — una falsa alarma, y de las que
            // desactivan sesiones ajenas.
            data: { refreshToken: null, previousRefreshToken: null, refreshExpires: null },
        });
    },

    async forgotPassword(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return; // silencioso — no revelar si el email existe

        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken: hash, resetExpires: expires },
        });

        await sendPasswordResetEmail(email, user.name ?? "Usuario", raw);
    },

    async resetPassword(rawToken: string, newPassword: string) {
        const hash = hashToken(rawToken);
        const user = await prisma.user.findFirst({ where: { resetToken: hash } });

        if (!user || !user.resetExpires || user.resetExpires < new Date()) {
            throw new HttpError(400, "Token inválido o expirado", "INVALID_OR_EXPIRED_TOKEN");
        }

        const hashed = await hashPassword(newPassword);
        // El reset es el flujo de recuperación de una cuenta potencialmente comprometida:
        // se revocan también las sesiones activas para que un refresh token robado deje
        // de servir de inmediato (mismo criterio que updatePassword).
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashed,
                resetToken: null,
                resetExpires: null,
                refreshToken: null,
                refreshExpires: null,
            },
        });
    },

    async getById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
            },
        });
    },

    async updateProfile(userId: string, name: string, email: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");

        const emailChanged = email !== user.email;
        if (emailChanged) {
            const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
            if (taken) throw new HttpError(409, "El correo ya está en uso por otra cuenta", "EMAIL_IN_USE");

            const { raw, hash } = generateToken();
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await prisma.user.update({
                where: { id: userId },
                data: {
                    name,
                    email,
                    isVerified: false,
                    verifyToken: hash,
                    verifyExpires: expires,
                },
            });

            await sendVerificationEmail(email, name, raw);
            return {
                emailChanged: true,
                message: "Correo actualizado. Revisa tu bandeja para confirmar tu nueva dirección.",
            };
        }

        await prisma.user.update({ where: { id: userId }, data: { name } });
        return {
            emailChanged: false,
            message: "Perfil actualizado exitosamente",
        };
    },

    async updatePassword(userId: string, currentPassword: string, password: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.password) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");

        const valid = await comparePassword(currentPassword, user.password);
        if (!valid) throw new HttpError(403, "La contraseña actual es incorrecta", "WRONG_CURRENT_PASSWORD");

        const hashed = await hashPassword(password);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashed, refreshToken: null, refreshExpires: null },
        });
        return {
            passwordChanged: true,
            message: "Contraseña actualizada exitosamente. Inicia sesión nuevamente.",
        };
    },
};
