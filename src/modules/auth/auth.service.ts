import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { hashPassword, comparePassword } from "@/shared/lib/hash";
import { generateToken, hashToken } from "@/shared/lib/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/shared/lib/nodemailer";

export const authService = {
    async register(email: string, password: string, name: string) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) throw new HttpError(409, "El correo ya está registrado");

        const hashed = await hashPassword(password);
        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // El primer usuario registrado obtiene rol ADMIN
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? "ADMIN" : "USER";

        await prisma.user.create({
            data: {
                name,
                email,
                password: hashed,
                role,
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
            throw new HttpError(400, "Token inválido o expirado");
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verifyToken: null, verifyExpires: null },
        });
    },

    async resendVerification(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.isVerified) throw new HttpError(400, "Cuenta no encontrada o ya verificada");

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
        if (!user || !user.password) throw new HttpError(401, "Credenciales inválidas");

        const valid = await comparePassword(password, user.password);
        if (!valid) throw new HttpError(401, "Credenciales inválidas");

        if (!user.isActive) throw new HttpError(403, "Tu cuenta ha sido desactivada. Contacta al administrador");
        if (!user.isVerified) throw new HttpError(403, "Confirma tu correo antes de iniciar sesión");

        const { raw, hash } = generateToken();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: hash, refreshExpires: expires },
        });

        return { user, rawRefreshToken: raw };
    },

    async refresh(rawToken: string) {
        const hash = hashToken(rawToken);
        const user = await prisma.user.findFirst({ where: { refreshToken: hash } });

        if (!user || !user.refreshExpires || user.refreshExpires < new Date()) {
            throw new HttpError(401, "Sesión expirada, inicia sesión nuevamente");
        }

        // Defensa en profundidad: `setActive(false)` ya anula el refresh token
        // (`users.service.ts`), pero comprobarlo aquí cubre cualquier otra vía de
        // desactivación —una edición directa en base de datos, un flujo futuro— sin
        // depender de que esa otra vía se acuerde de limpiar el token.
        if (!user.isActive) {
            throw new HttpError(401, "Sesión expirada, inicia sesión nuevamente");
        }

        // Rotación: el token anterior queda inválido, se emite uno nuevo
        const { raw, hash: newHash } = generateToken();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: newHash, refreshExpires: expires },
        });

        return { user, rawRefreshToken: raw };
    },

    async revokeRefreshToken(rawToken: string) {
        const hash = hashToken(rawToken);
        await prisma.user.updateMany({
            where: { refreshToken: hash },
            data: { refreshToken: null, refreshExpires: null },
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
            throw new HttpError(400, "Token inválido o expirado");
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
        if (!user) throw new HttpError(404, "Usuario no encontrado");

        const emailChanged = email !== user.email;
        if (emailChanged) {
            const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
            if (taken) throw new HttpError(409, "El correo ya está en uso por otra cuenta");

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
        if (!user || !user.password) throw new HttpError(404, "Usuario no encontrado");

        const valid = await comparePassword(currentPassword, user.password);
        if (!valid) throw new HttpError(403, "La contraseña actual es incorrecta");

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
