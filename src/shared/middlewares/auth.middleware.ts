import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "@/shared/lib/jwt";
import { prisma } from "@/shared/lib/prisma";
import { PERMISOS, type RutaConPermiso } from "@/contratos/api";
import type { $Enums } from "@/generated/prisma/client";

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

/**
 * T5-13 — con el enum de la base y no con cadenas: con tres roles, un `"ADMN"` escrito a mano
 * compilaría y dejaría la ruta cerrada para todos sin ningún error visible, que es la clase de
 * fallo que T3-02 cerró en la base.
 */
export function requireRole(...roles: readonly $Enums.Role[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.userRole || !roles.includes(req.userRole)) {
            res.status(403).json({
                success: false,
                message: "No tienes permisos para realizar esta acción",
                code: "FORBIDDEN",
            });
            return;
        }
        next();
    };
}

/**
 * La forma de proteger una ruta: con su fila de la matriz `PERMISOS` del contrato, no con una
 * lista de roles escrita al lado. La clave queda pegada al middleware para que
 * `permisos.test.ts` compruebe que cada ruta usa **su** fila y no la de otra.
 */
export function permitir(ruta: RutaConPermiso) {
    return Object.assign(requireRole(...PERMISOS[ruta]), { rutaConPermiso: ruta });
}

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userRole?: $Enums.Role;
            userEmail?: string;
        }
    }
}
