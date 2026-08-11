import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";
import type { Request } from "express";

/**
 * Métricas en formato Prometheus (T4-06).
 *
 * **Se usa `prom-client` y no un contador propio**, al revés que en i18n (ADR 0007) o en
 * el spec de OpenAPI (T4-02). El criterio es el mismo de siempre —¿resuelve la librería
 * algo que aquí sí tenemos?— y esta vez la respuesta es sí: los *buckets* acumulativos de
 * un histograma, el escapado del formato de exposición y, sobre todo,
 * `collectDefaultMetrics`, que trae el retraso del bucle de eventos, el uso del montón y
 * las pausas del recolector de basura. Un `Map` de contadores no da ninguna de las tres, y
 * el retraso del bucle de eventos es justo la métrica que explica «la API va lenta y la
 * base está bien».
 *
 * El registro es propio (`new Registry()`) en vez del global del paquete: dos suites de
 * test que importen esto no chocan entre sí con «A metric with the name … has already
 * been registered».
 */
export const registro = new Registry();

registro.setDefaultLabels({ servicio: "stockly-backend" });

collectDefaultMetrics({ register: registro });

/**
 * La **plantilla** de la ruta, nunca la URL pedida.
 *
 * Esto no es cosmética: es lo que separa una métrica de una bomba de memoria. Con
 * `originalUrl`, cada `GET /api/v1/products/<cuid>` crea una serie temporal nueva y para
 * mil productos hay mil series que Prometheus guarda para siempre —el problema tiene
 * nombre propio, «explosión de cardinalidad»—. `req.route.path` da `/:id`, que es una
 * sola serie para todos los productos.
 *
 * Lo que no casa con ninguna ruta (los 404, y son continuos: los escáneres de
 * vulnerabilidades piden `/wp-login.php` todo el día) se agrupa bajo una etiqueta fija por
 * la misma razón: si no, cualquiera desde fuera puede hacer crecer la memoria del proceso
 * pidiendo URLs inventadas.
 */
export function plantillaDeRuta(req: Request): string {
    const ruta = (req.route as { path?: string } | undefined)?.path;
    if (!ruta) return "desconocida";

    /*
     * **No se usa `req.baseUrl + req.route.path`, que es lo que se escribe primero.** Un
     * test lo tumbó: Express 5 restaura `baseUrl` al desapilar el router, así que en el
     * momento en que la respuesta termina ya vale `""` y la etiqueta salía como `/:id` —los
     * doce módulos mezclados en una sola serie—. Con un 5xx es peor todavía, porque la
     * respuesta la escribe `errorHandler`, que vive fuera del router.
     *
     * Lo que sí sobrevive es la URL pedida. La plantilla se reconstruye sustituyendo por
     * `req.route.path` tantos segmentos finales como tenga: para
     * `/api/v1/products/<cuid>` con ruta `/:id`, el prefijo es `/api/v1/products` y el
     * resultado, `/api/v1/products/:id`. No depende de cuándo se lea.
     */
    const pedida = (req.originalUrl ?? req.url).split("?")[0] ?? "";
    const deLaRuta = ruta.split("/").filter(Boolean);
    const pedidos = pedida.split("/").filter(Boolean);

    if (deLaRuta.length > pedidos.length) return "desconocida";

    const prefijo = pedidos.slice(0, pedidos.length - deLaRuta.length);
    return `/${[...prefijo, ...deLaRuta].join("/")}`;
}

export const peticionesHttp = new Counter({
    name: "http_requests_total",
    help: "Peticiones HTTP atendidas",
    labelNames: ["method", "route", "status"] as const,
    registers: [registro],
});

export const duracionHttp = new Histogram({
    name: "http_request_duration_seconds",
    help: "Duración de las peticiones HTTP, en segundos",
    labelNames: ["method", "route", "status"] as const,
    // Los buckets por defecto de la librería llegan hasta 10 s y empiezan en 5 ms, que
    // para una API con la base al lado deja casi todo en el primer bucket y no permite
    // leer un p95. Estos se ajustan a lo medido en este proyecto: el histórico de un
    // producto con 40 000 movimientos tarda 0.747 ms (T2-09), y la exportación en CSV
    // —que va en streaming— es lo único que se acerca al segundo.
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registro],
});

/**
 * Errores del servidor, aparte del contador general.
 *
 * Se puede deducir de `http_requests_total{status=~"5.."}`, y aun así existe: es la serie
 * sobre la que se escribe la regla de alerta, y una regla que se lee de un vistazo es una
 * regla que alguien revisa. Lleva la ruta para que la alerta diga **dónde**.
 */
export const erroresServidor = new Counter({
    name: "http_server_errors_total",
    help: "Respuestas 5xx devueltas",
    labelNames: ["method", "route", "status"] as const,
    registers: [registro],
});

/** El texto de exposición, tal cual lo raspa Prometheus. */
export async function exponer(): Promise<{ cuerpo: string; tipo: string }> {
    return { cuerpo: await registro.metrics(), tipo: registro.contentType };
}
