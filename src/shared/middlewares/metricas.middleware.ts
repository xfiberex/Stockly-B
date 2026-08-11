import type { Request, Response, NextFunction } from "express";
import { peticionesHttp, duracionHttp, erroresServidor, plantillaDeRuta } from "@/shared/lib/metricas";
import { registrar5xx } from "@/shared/lib/alertas5xx";

/**
 * Mide cada petición y alimenta las métricas y la alerta de 5xx (T4-06).
 *
 * Se engancha a `res.on("finish")` y no envuelve `res.end` ni se pone detrás de las rutas:
 *
 * - Un middleware colocado **después** del router no se ejecuta nunca para las peticiones
 *   que responden dentro de él, que son todas. Es el error clásico al instrumentar Express.
 * - `finish` se emite cuando la respuesta ya se ha entregado al sistema operativo, así que
 *   el estado final es el definitivo y el tiempo incluye lo que tardó en escribirse —lo
 *   que de verdad esperó el cliente—.
 * - Cubre también lo que muere antes de llegar al router (rate limit, CSRF, cuerpo
 *   demasiado grande) y los 5xx que no pasan por el manejador de errores.
 *
 * La plantilla de ruta se calcula aquí y no al entrar, porque al entrar Express todavía no
 * ha casado la petición con ninguna ruta. Que ese cálculo **no dependa de `req.baseUrl`**
 * es justo lo que permite hacerlo en este punto: ver `plantillaDeRuta`.
 */
export function metricas(req: Request, res: Response, next: NextFunction): void {
    // `hrtime` y no `Date.now()`: es monótono, así que un ajuste del reloj del sistema no
    // produce duraciones negativas —que en un histograma no se corrigen, se quedan—.
    const inicio = process.hrtime.bigint();

    res.on("finish", () => {
        const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
        const etiquetas = {
            method: req.method,
            route: plantillaDeRuta(req),
            status: String(res.statusCode),
        };

        peticionesHttp.inc(etiquetas);
        duracionHttp.observe(etiquetas, segundos);

        if (res.statusCode >= 500) {
            erroresServidor.inc(etiquetas);
            registrar5xx({
                ruta: `${etiquetas.method} ${etiquetas.route}`,
                status: res.statusCode,
                requestId: typeof req.id === "string" ? req.id : undefined,
            });
        }
    });

    next();
}
