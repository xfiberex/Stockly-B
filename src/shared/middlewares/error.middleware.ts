import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import { logger } from "@/shared/lib/logger";

/**
 * Errores de terceros que ya traen su código y un mensaje pensado para el cliente.
 *
 * Es la convención de `http-errors`, que usan Express y `body-parser`: `expose: true`
 * significa «este mensaje se puede enseñar». Sin esto, un cuerpo por encima del límite
 * (T2-33) se trataba como avería y salía **500** — en desarrollo con el mensaje real y en
 * producción con «Error interno del servidor», que es justo lo contrario de lo que pasa:
 * la petición está mal, el servidor está bien.
 *
 * Se comprueba `expose` y no solo el código, para no reenviar al cliente el mensaje de un
 * error de terceros que no estuviera pensado para él.
 */
function errorExpuestoDeTercero(err: Error): { statusCode: number; message: string } | null {
    const e = err as Error & { status?: unknown; statusCode?: unknown; expose?: unknown };
    const codigo = typeof e.status === "number" ? e.status : e.statusCode;

    if (e.expose === true && typeof codigo === "number" && codigo >= 400 && codigo < 500) {
        return { statusCode: codigo, message: err.message };
    }
    return null;
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    try {
        if (err instanceof HttpError) {
            res.status(err.statusCode).json({ success: false, message: err.message });
            return;
        }

        const deTercero = errorExpuestoDeTercero(err);
        if (deTercero) {
            res.status(deTercero.statusCode).json({ success: false, message: deTercero.message });
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
