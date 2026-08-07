import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "@/shared/lib/jwt";
import { prisma } from "@/shared/lib/prisma";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.cookies?.["token"] as string | undefined;
    if (!token) {
        res.status(401).json({ success: false, message: "No autenticado" });
        return;
    }

    try {
        const payload = verifyToken(token);
        // `email` se carga aquí para que los controladores no repitan la consulta en
        // cada mutación al registrar la auditoría (ver `req.userEmail`).
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, role: true, isActive: true, email: true },
        });

        if (!user) {
            res.status(401).json({ success: false, message: "Usuario no encontrado" });
            return;
        }

        // Sin esta comprobación, desactivar una cuenta no surtía efecto hasta que
        // expirase su access token: hasta 15 minutos de acceso con la cuenta cerrada.
        if (!user.isActive) {
            res.status(403).json({ success: false, message: "Tu cuenta está desactivada" });
            return;
        }

        req.userId = user.id;
        req.userRole = user.role;
        req.userEmail = user.email;
        next();
    } catch {
        res.status(401).json({ success: false, message: "Token inválido o expirado" });
    }
}

export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.userRole || !roles.includes(req.userRole)) {
            res.status(403).json({ success: false, message: "No tienes permisos para realizar esta acción" });
            return;
        }
        next();
    };
}

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userRole?: string;
            userEmail?: string;
        }
    }
}
