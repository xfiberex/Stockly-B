import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    try {
        if (err instanceof HttpError) {
            res.status(err.statusCode).json({ success: false, message: err.message });
            return;
        }

        // Error inesperado (no controlado): se registra siempre para tener trazabilidad
        // en producción, donde el mensaje al cliente se oculta.
        if (env.nodeEnv !== "test") {
            console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
        }

        res.status(500).json({
            success: false,
            message: env.nodeEnv === "production" ? "Error interno del servidor" : err.message,
        });
    } catch (error) {
        console.error("Error en errorHandler:", error);
    }
}
