import type { Request, Response } from "express";
import crypto from "crypto";
import { authService } from "@/modules/auth/auth.service";
import { signToken } from "@/shared/lib/jwt";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import { CSRF_COOKIE_NAME } from "@/shared/middlewares/csrf.middleware";
import { idiomaDePeticion } from "@/shared/lib/idiomaDePeticion";
import type { Idioma } from "@/shared/i18n/correos";

/**
 * T2-28 — los atributos de las cookies dependen de **cómo se sirve**, no solo del
 * `NODE_ENV`.
 *
 * Con `NODE_ENV=production` esto ponía siempre `secure: true` y `sameSite: "none"`, que
 * es lo correcto cuando frontend y backend viven en dominios distintos y detrás de TLS.
 * Pero la pila del compose sirve los dos **desde el mismo origen** (nginx delante) y por
 * HTTP: ahí `secure: true` hace que el navegador descarte la cookie de sesión sin decir
 * nada, y el login parece fallar por credenciales. Se descubrió montando esa pila.
 *
 * Los valores por defecto no cambian, así que un despliegue existente se comporta igual.
 * `COOKIE_SECURE` y `COOKIE_SAMESITE` permiten declarar la topología real cuando no es la
 * supuesta — que es justo lo que hace `docker-compose.yml`.
 */
const isProd = env.nodeEnv === "production";
const sameSite = (process.env.COOKIE_SAMESITE ?? (isProd ? "none" : "lax")) as "none" | "lax";
const secure = process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === "true" : isProd;

const COOKIE_OPTS = {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: env.jwt.expiresInMs, // derivado de JWT_EXPIRES_IN — una sola fuente de verdad
};

// Path restringido: el navegador solo envía esta cookie al endpoint /refresh
const REFRESH_COOKIE_OPTS = {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth/refresh",
};

// Cookie del token CSRF: legible por JS (no httpOnly) para que el frontend la reenvíe
// como cabecera. Protección double-submit contra peticiones cross-site.
const CSRF_COOKIE_OPTS = {
    httpOnly: false,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

function issueSessionCookies(
    res: Response,
    userId: string,
    rawRefreshToken: string,
): void {
    const token = signToken({ userId });
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res
        .cookie("token", token, COOKIE_OPTS)
        .cookie("refreshToken", rawRefreshToken, REFRESH_COOKIE_OPTS)
        .cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTS);
}

export const authController = {
    async register(req: Request, res: Response) {
        const { email, password, name } = req.body as { email: string; password: string; name: string };
        // T4-12: el idioma del correo de verificación sale de `Accept-Language`, porque
        // todavía no hay fila de usuario de la que leerlo. Se guarda en la que se crea.
        await authService.register(email, password, name, idiomaDePeticion(req));
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
        const { user, rawRefreshToken } = await authService.login(email, password);
        issueSessionCookies(res, user.id, rawRefreshToken);
        res.json({ message: "Sesión iniciada", data: { id: user.id, email: user.email, name: user.name } });
    },

    async logout(req: Request, res: Response) {
        const rawRefreshToken = req.cookies?.["refreshToken"] as string | undefined;
        if (rawRefreshToken) {
            await authService.revokeRefreshToken(rawRefreshToken).catch(() => {});
        }
        res
            .clearCookie("token")
            .clearCookie("refreshToken", { path: "/api/v1/auth/refresh" })
            .clearCookie(CSRF_COOKIE_NAME)
            .json({ message: "Sesión cerrada" });
    },

    async refresh(req: Request, res: Response) {
        const rawRefreshToken = req.cookies?.["refreshToken"] as string | undefined;
        if (!rawRefreshToken) throw new HttpError(401, "No autenticado", "NOT_AUTHENTICATED");

        const { user, rawRefreshToken: newRawToken } = await authService.refresh(rawRefreshToken);
        issueSessionCookies(res, user.id, newRawToken);
        res.json({ message: "Token renovado", data: { id: user.id, email: user.email, name: user.name } });
    },

    async me(req: Request, res: Response) {
        const user = await authService.getById(req.userId!);
        if (!user) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");
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

    async updateIdioma(req: Request, res: Response) {
        const { idioma } = req.body as { idioma: Idioma };
        const result = await authService.updateIdioma(req.userId!, idioma);
        res.json({ data: result });
    },

    async updatePassword(req: Request, res: Response) {
        const { currentPassword, password } = req.body as { currentPassword: string; password: string };
        const result = await authService.updatePassword(req.userId!, currentPassword, password);
        res
            .clearCookie("token")
            .clearCookie("refreshToken", { path: "/api/v1/auth/refresh" })
            .clearCookie(CSRF_COOKIE_NAME)
            .json(result);
    },
};
