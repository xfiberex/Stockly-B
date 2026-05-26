import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../shared/lib/jwt.js";

// Middleware para proteger rutas que requieren autenticación
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.["token"] as string | undefined;
    if (!token) {
        res.status(401).json({ error: "No autenticado" });
        return;
    }

    try {
        const payload = verifyToken(token);
        req.userId = payload.userId;
        next();
    } catch {
        res.status(401).json({ error: "Token inválido o expirado" });
    }
}

// Extiende el tipo Request de Express para incluir userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}