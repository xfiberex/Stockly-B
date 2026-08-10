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

/**
 * T3-13 — quita del mensaje las rutas del sistema de archivos antes de enviarlo.
 *
 * Fuera de producción se responde `err.message` íntegro, y el de un error de Prisma no es
 * una frase: incluye la consulta y **la ruta absoluta del archivo fuente**, que delata el
 * usuario del sistema y la estructura de directorios. Reproducido durante T3-02, donde
 * `?status=toString` devolvía `C:\Users\…\sale-orders.service.ts:32:30` en el cuerpo.
 *
 * Se sanea siempre, no solo cuando `NODE_ENV` está bien puesto. Una garantía que depende
 * de que alguien recuerde una variable en el entorno de staging no es una garantía; el
 * compose la fija, pero el compose no es el único sitio desde el que esto se despliega.
 *
 * El patrón exige que la ruta **termine en una extensión de código** para no morder texto
 * corriente, y admite espacios dentro de los segmentos: la ruta real de este proyecto
 * tiene dos (`Desarrollo y Proyectos`), y un patrón que cortara en el primer espacio
 * habría dejado pasar justo la parte que identifica la máquina.
 */
const RUTA_DE_ARCHIVO =
    /(?:[A-Za-z]:[\\/]|\/)(?:[^\\/\r\n]+[\\/])+[^\\/\r\n]*\.(?:ts|tsx|js|jsx|mjs|cjs|json|node)(?::\d+(?::\d+)?)?/g;

export function sinRutasDeArchivo(mensaje: string): string {
    return mensaje.replace(RUTA_DE_ARCHIVO, "[ruta oculta]");
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    try {
        if (err instanceof HttpError) {
            // `code` y `params` solo salen si los hay (T4-04): un error sin código deja el
            // sobre exactamente como estaba antes, y el cliente enseña el `message`.
            res.status(err.statusCode).json({
                success: false,
                message: err.message,
                ...(err.code ? { code: err.code } : {}),
                ...(err.params ? { params: err.params } : {}),
            });
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
            message: env.nodeEnv === "production" ? "Error interno del servidor" : sinRutasDeArchivo(err.message),
            // Lo que el cliente puede enseñar traducido. El `message` de arriba sigue siendo
            // el que se registra y el que ve quien llama a la API sin interfaz: fuera de
            // producción trae el error real, que es justo lo que no conviene traducir.
            code: "INTERNAL_ERROR",
            // El cliente no ve el error real en producción, así que se le da el hilo
            // del que tirar: este identificador es el que hay que citar al reportarlo.
            requestId: res.getHeader("x-request-id"),
        });
    } catch (error) {
        logger.error({ err: error }, "Fallo dentro del propio manejador de errores");
    }
}
