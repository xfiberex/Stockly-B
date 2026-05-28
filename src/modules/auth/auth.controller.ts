import type { Request, Response } from "express";
import { authService } from "@/modules/auth/auth.service";
import { signToken } from "@/shared/lib/jwt";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";

const isProd = env.nodeEnv === "production";

// httpOnly evita acceso por JS; secure + sameSite none para cross-domain en producción
const COOKIE_OPTS = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const authController = {
    async register(req: Request, res: Response) {
        const { email, password, name } = req.body as { email: string; password: string; name: string };
        await authService.register(email, password, name);
        res.status(201).json({ message: "Revisa tu correo para confirmar tu cuenta" });
    },

    async verifyEmail(req: Request, res: Response) {
        const { token } = req.body as { token: string };
        await authService.verifyEmail(token);
        res.json({ message: "Cuenta confirmada exitosamente" });
    },

    async resendVerification(req: Request, res: Response) {
        const { email } = req.body as { email: string };
        await authService.resendVerification(email);
        res.json({ message: "Correo de verificación reenviado" });
    },

    async login(req: Request, res: Response) {
        const { email, password } = req.body as { email: string; password: string };
        const user = await authService.login(email, password);
        const token = signToken({ userId: user.id });
        res
            .cookie("token", token, COOKIE_OPTS)
            .json({ message: "Sesión iniciada", data: { id: user.id, email: user.email, name: user.name } });
    },

    async logout(_req: Request, res: Response) {
        res.clearCookie("token").json({ message: "Sesión cerrada" });
    },

    async me(req: Request, res: Response) {
        const user = await authService.getById(req.userId!);
        if (!user) throw new HttpError(404, "Usuario no encontrado");
        res.json({ data: user });
    },

    async forgotPassword(req: Request, res: Response) {
        const { email } = req.body as { email: string };
        await authService.forgotPassword(email);
        res.json({ message: "Si el correo existe, recibirás instrucciones para restablecer tu contraseña" });
    },

    async resetPassword(req: Request, res: Response) {
        const { token, password } = req.body as { token: string; password: string };
        await authService.resetPassword(token, password);
        res.json({ message: "Contraseña restablecida exitosamente" });
    },

    async updateProfile(req: Request, res: Response) {
        const { name, email } = req.body as { name: string; email: string };
        const result = await authService.updateProfile(req.userId!, name, email);
        res.json(result);
    },

    async updatePassword(req: Request, res: Response) {
        const { currentPassword, password } = req.body as { currentPassword: string; password: string };
        const result = await authService.updatePassword(req.userId!, currentPassword, password);
        // Limpia la cookie del dispositivo actual; el JWT en otros dispositivos expira por su propio TTL
        res.clearCookie("token").json(result);
    },
};
