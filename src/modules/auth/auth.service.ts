import { prisma } from "../../shared/lib/prisma.js";
import { HttpError } from "../../shared/lib/httpError.js";
import { hashPassword, comparePassword } from "../../shared/lib/hash.js";
import crypto from "crypto";
import { sendPasswordResetEmail, sendVerificationEmail } from "../../shared/lib/nodemailer.js";

// Servicio de autenticación y validación de usuarios
export const authService = {
    // Registro de nuevo usuario
    async register(email: string, password: string, name: string) {
        // Verificar si el correo ya está registrado
        const existing = await prisma.user.findUnique({ where: { email } });

        // Si el correo ya existe, lanzar un error de conflicto
        if (existing) throw new HttpError(409, "El correo ya está registrado");

        // Hashear la contraseña y generar token de verificación
        const hashed = await hashPassword(password);
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Crear el usuario en la base de datos
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashed,
                verifyToken: token,
                verifyExpires: expires,
            },
        });

        // Enviar correo de verificación
        await sendVerificationEmail(email, name, token);
        return user;
    },

    // Verificación de correo electrónico
    async verifyEmail(token: string) {
        // Buscar el usuario por el token de verificación
        const user = await prisma.user.findFirst({ where: { verifyToken: token } });

        // Verificar si el token es válido y no ha expirado
        if (!user || !user.verifyExpires || user.verifyExpires < new Date()) {
            throw new HttpError(400, "Token inválido o expirado");
        }

        // Marcar el usuario como verificado y limpiar el token
        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verifyToken: null, verifyExpires: null },
        });
    },

    // Reenviar correo de verificación
    async resendVerification(email: string) {
        // Buscar el usuario por correo electrónico
        const user = await prisma.user.findUnique({ where: { email } });

        // Verificar si el usuario existe y no está verificado
        if (!user || user.isVerified) throw new HttpError(400, "Cuenta no encontrada o ya verificada");

        // Generar nuevo token de verificación
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Actualizar el usuario con el nuevo token y fecha de expiración
        await prisma.user.update({
            where: { id: user.id },
            data: { verifyToken: token, verifyExpires: expires },
        });

        // Enviar correo de verificación
        await sendVerificationEmail(email, user.name ?? "Usuario", token);
    },

    // Inicio de sesión
    async login(email: string, password: string) {
        // Buscar el usuario por correo electrónico
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) throw new HttpError(401, "Credenciales inválidas");

        // Verificar la contraseña
        const valid = await comparePassword(password, user.password);
        if (!valid) throw new HttpError(401, "Credenciales inválidas");

        // Verificar si el correo está confirmado
        if (!user.isVerified) throw new HttpError(403, "Confirma tu correo antes de iniciar sesión");
        return user;
    },

    // Solicitud de restablecimiento de contraseña
    async forgotPassword(email: string) {
        // Buscar el usuario por correo electrónico
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return; // silencioso — no revelar si el email existe

        // Generar token de restablecimiento y fecha de expiración
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

        // Actualizar el usuario con el token de restablecimiento y fecha de expiración
        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken: token, resetExpires: expires },
        });

        // Enviar correo de restablecimiento de contraseña
        await sendPasswordResetEmail(email, user.name ?? "Usuario", token);
    },

    // Restablecimiento de contraseña
    async resetPassword(token: string, newPassword: string) {
        // Buscar el usuario por el token de restablecimiento
        const user = await prisma.user.findFirst({ where: { resetToken: token } });

        // Verificar si el token es válido y no ha expirado
        if (!user || !user.resetExpires || user.resetExpires < new Date()) {
            throw new HttpError(400, "Token inválido o expirado");
        }

        // Hashear la nueva contraseña y actualizar el usuario
        const hashed = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed, resetToken: null, resetExpires: null },
        });
    },

    // Obtener usuario por ID (sin contraseña)
    async getById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                isVerified: true,
                createdAt: true,
            },
        });
    },

    /* ----- Apartado de gestión de perfil de usuario ----- */

    // Actualizar perfil de usuario (nombre y correo)
    async updateProfile(userId: string, name: string, email: string) {
        // Buscar el usuario por ID
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new HttpError(404, "Usuario no encontrado");

        // Verificar si el correo ha cambiado
        const emailChanged = email !== user.email;
        if (emailChanged) {
            // Verificar si el nuevo correo ya está registrado por otro usuario
            const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });

            // Verificar si el nuevo correo ya está en uso por otra cuenta
            if (taken) throw new HttpError(409, "El correo ya está en uso por otra cuenta");

            // Generar nuevo token de verificación para el nuevo correo
            const token = crypto.randomBytes(32).toString("hex");
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Actualizar el usuario con el nuevo nombre, correo y estado de verificación
            await prisma.user.update({
                where: { id: userId },
                data: {
                    name,
                    email,
                    isVerified: false,
                    verifyToken: token,
                    verifyExpires: expires,
                },
            });

            // Enviar correo de verificación al nuevo correo electrónico
            await sendVerificationEmail(email, name, token);
            return { 
                emailChanged: true,
                message: "Correo actualizado. Revisa tu bandeja para confirmar tu nueva dirección.",
            };
        }

        // Si el correo no ha cambiado, solo actualizar el nombre
        await prisma.user.update({ where: { id: userId }, data: { name } });
        return {
            emailChanged: false,
            message: "Perfil actualizado exitosamente",
        };
    },

    // Actualizar contraseña de usuario
    async updatePassword( userId: string, currentpassword: string, password: string ) {
        // Buscar el usuario por ID
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.password) throw new HttpError(404, "Usuario no encontrado");

        // Verificar la contraseña actual
        const valid = await comparePassword(currentpassword, user.password);
        if (!valid) throw new HttpError(403, "La contraseña actual es incorrecta");

        // Hashear la nueva contraseña y actualizar el usuario
        const hashed = await hashPassword(password);
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        return {
            passwordChanged: true,
            message: "Contraseña actualizada exitosamente. Inicia sesión nuevamente.",
        };
    },
};
