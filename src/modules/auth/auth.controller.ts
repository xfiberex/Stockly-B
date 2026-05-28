import type { Request, Response } from "express";
import { authService } from "@/modules/auth/auth.service";
import { signToken } from "@/shared/lib/jwt";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";

// Opciones para la cookie de autenticación
const COOKIE_OPTS = {
    httpOnly: true,
    secure: env.nodeEnv === "production", // Solo enviar cookie por HTTPS en producción
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

export const authController = {

    // Registro de nuevo usuario
    async register(req: Request, res: Response) {
        const { email, password, name } = req.body as { email: string; password: string; name: string };
        await authService.register(email, password, name);
        res.status(201).json({ message: "Revisa tu correo para confirmar tu cuenta" });
    },

    // Verificación de correo electrónico
    async verifyEmail(req: Request, res: Response) {
        const { token } = req.body as { token: string };
        await authService.verifyEmail(token);
        res.json({ message: "Cuenta confirmada exitosamente" });
    },

    // Reenvío de correo de verificación
    async resendVerification(req: Request, res: Response) {
        const { email } = req.body as { email: string };
        await authService.resendVerification(email);
        res.json({ message: "Correo de verificación reenviado" });
    },

    // Inicio de sesión
    async login(req: Request, res: Response) {
        const { email, password } = req.body as { email: string; password: string };

        // Llamada al servicio de autenticación para verificar credenciales
        const user = await authService.login(email, password);

        // Generar token JWT con el ID del usuario
        const token = signToken({ userId: user.id });

        // Enviar token en una cookie segura y responder con los datos del usuario
        res
            .cookie("token", token, COOKIE_OPTS)
            .json({ message: "Sesión iniciada", data: { id: user.id, email: user.email, name: user.name } });
    },

    // Cierre de sesión
    async logout(_req: Request, res: Response) {
        // Limpiar la cookie de autenticación para cerrar sesión
        res.clearCookie("token").json({ message: "Sesión cerrada" });
    },

    // Obtener datos del usuario autenticado
    async me(req: Request, res: Response) {
        // req.userId es establecido por el middleware de autenticación
        const user = await authService.getById(req.userId!);
        if (!user) throw new HttpError(404, "Usuario no encontrado");
        res.json({ data: user });
    },

    // Solicitar restablecimiento de contraseña
    async forgotPassword(req: Request, res: Response) {
        const { email } = req.body as { email: string };
        await authService.forgotPassword(email);
        res.json({ message: "Si el correo existe, recibirás instrucciones para restablecer tu contraseña" });
    },

    // Restablecer contraseña con token
    async resetPassword(req: Request, res: Response) {
        const { token, password } = req.body as { token: string; password: string };
        await authService.resetPassword(token, password);
        res.json({ message: "Contraseña restablecida exitosamente" });
    },

    // Actualizar perfil (nombre y correo)
    async updateProfile(req: Request, res: Response) {
        const { name, email } = req.body as { name: string; email: string };
        const result = await authService.updateProfile(req.userId!, name, email);
        res.json(result);
    },

    // Actualizar contraseña (requiere contraseña actual)
    async updatePassword(req: Request, res: Response) {
        const { currentPassword, password } = req.body as {
            currentPassword: string;
            password: string;
        };
        const result = await authService.updatePassword(req.userId!, currentPassword, password);
        // Después de cambiar la contraseña, es buena práctica cerrar sesión en otros dispositivos
        res.clearCookie("token").json(result);
    },
}
