import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import { logger } from "@/shared/lib/logger";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    try {
        if (err instanceof HttpError) {
            res.status(err.statusCode).json({ success: false, message: err.message });
            return;
        }

        // Error inesperado (no controlado): se registra siempre para tener trazabilidad
        // en producción, donde el mensaje al cliente se oculta. `req.log` lo pone
        // `pino-http` y ya lleva dentro el `requestId` de esta petición (T2-10), que es
        // lo que permite recuperar después todas sus líneas — incluida la de acceso.
        (req.log ?? logger).error({ err }, `Error no controlado en ${req.method} ${req.originalUrl}`);

        res.status(500).json({
            success: false,
            message: env.nodeEnv === "production" ? "Error interno del servidor" : err.message,
            // El cliente no ve el error real en producción, así que se le da el hilo
            // del que tirar: este identificador es el que hay que citar al reportarlo.
            requestId: res.getHeader("x-request-id"),
        });
    } catch (error) {
        logger.error({ err: error }, "Fallo dentro del propio manejador de errores");
    }
}
