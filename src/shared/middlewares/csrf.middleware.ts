import type { Request, Response, NextFunction } from "express";

// Protección CSRF mediante el patrón double-submit cookie:
// el backend emite una cookie `csrfToken` legible por JS y el frontend la reenvía
// como cabecera `x-csrf-token`. Un sitio atacante puede provocar que el navegador
// envíe la cookie, pero no puede leerla para replicarla en la cabecera (same-origin).
export const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

    // Los endpoints de autenticación establecen la sesión y no dependen de un token previo.
    if (req.path.startsWith("/api/v1/auth/")) {
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
