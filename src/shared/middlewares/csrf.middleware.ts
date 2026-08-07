import type { Request, Response, NextFunction } from "express";

// Protección CSRF mediante el patrón double-submit cookie:
// el backend emite una cookie `csrfToken` legible por JS y el frontend la reenvía
// como cabecera `x-csrf-token`. Un sitio atacante puede provocar que el navegador
// envíe la cookie, pero no puede leerla para replicarla en la cabecera (same-origin).
export const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Rutas públicas: se invocan sin sesión previa, así que no puede existir todavía una
// cookie CSRF que reenviar. La lista es explícita a propósito. Un prefijo
// `/api/v1/auth/` eximía también `logout`, `PUT /me` y `PATCH /me/password`, que son
// operaciones autenticadas y mutantes — `logout` era explotable por formulario
// cross-site, sin preflight que lo frenara.
const CSRF_EXEMPT_PATHS = new Set([
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/resend-verification",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
]);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    // En tests no hay navegador que gestione la cookie; se omite igual que el rate limit.
    if (process.env.NODE_ENV === "test") {
        next();
        return;
    }

    // Métodos seguros (no mutan estado) no requieren token.
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    // Solo las siete rutas públicas quedan exentas; el resto de `/auth`, no.
    if (CSRF_EXEMPT_PATHS.has(req.path)) {
        next();
        return;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = req.get(CSRF_HEADER_NAME);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        res.status(403).json({ success: false, message: "Token CSRF inválido o ausente" });
        return;
    }

    next();
}
