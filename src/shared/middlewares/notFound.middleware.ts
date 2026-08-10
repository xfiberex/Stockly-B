import { Request, Response, NextFunction } from "express";
import { HttpError } from "@/shared/lib/httpError";

/**
 * T2-01 — 404 en el mismo sobre que el resto de la API.
 *
 * Sin esto, una ruta desconocida cae en el manejador por defecto de Express, que
 * responde una **página HTML** (`<!DOCTYPE html>… Cannot GET /api/v1/…`). Un cliente que
 * hace `res.json()` con esa respuesta revienta al parsear, y el error que ve el
 * desarrollador —«Unexpected token < in JSON»— no menciona en ningún momento que la ruta
 * no existe. Es decir: el fallo más común de integración disfrazado del menos informativo.
 *
 * No formatea la respuesta: **lanza**. Así el sobre `{ success, message }` sigue
 * escribiéndose en un único sitio, `errorHandler`, y un 404 queda registrado por el mismo
 * camino que los demás errores, con su `requestId`. Va después del router y de Swagger
 * —lo que se monta más tarde no llega a verse— y justo antes del manejador de errores.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
    // Se nombra el método además de la ruta: pedir una ruta que sí existe con el verbo
    // equivocado da también un 404, y sin el método el mensaje parece mentir.
    next(
        new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND", {
            metodo: req.method,
            ruta: req.originalUrl,
        }),
    );
}
