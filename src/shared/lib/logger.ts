import { randomUUID } from "node:crypto";
import pino from "pino";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "@/config/env";

/**
 * Logging estructurado (T2-10).
 *
 * Antes había `morgan("dev")` solo en desarrollo y un `console.error` de texto
 * plano en producción: sin niveles, sin formato que una máquina pueda leer y,
 * sobre todo, sin forma de atar entre sí las líneas de una misma petición. Al
 * investigar un 500 en producción no se podía saber qué más había hecho ese
 * usuario en esa llamada.
 *
 * En producción la salida es JSON por línea, que es lo que esperan los
 * recolectores. En desarrollo se pasa por `pino-pretty` para no perder la
 * legibilidad que daba morgan.
 */
/**
 * El formato legible solo cuando hay una persona mirando.
 *
 * `pino-pretty` es un *transport*: pino levanta un hilo de trabajo y le pasa cada
 * línea por un canal. En una terminal eso no se nota; con el E2E de Playwright
 * —cuatro navegadores, Vite compilando y el servidor en `tsx`— sí: **la pasada
 * pasó de 36 s a 66 s y dos pruebas empezaron a agotar su tiempo**. Medido con y
 * sin esta condición sobre la misma máquina.
 *
 * Cuando la salida no es una terminal (el `webServer` de Playwright, Docker, un
 * recolector de logs) nadie va a leer los colores: se escribe JSON directo, que
 * además es lo que esas tres cosas quieren.
 */
const salidaLegible = env.nodeEnv === "development" && process.stdout.isTTY === true;

/**
 * Destino de la salida.
 *
 * Por defecto pino escribe con sonic-boom directamente sobre el descriptor 1,
 * saltándose `process.stdout.write` — que es justo lo que un test necesita
 * interceptar para comprobar qué se registró. En `test` se le pasa el stream de
 * Node para poder leerlo; fuera de test se deja el camino rápido de pino
 * intacto. La rama es fea, pero la alternativa es no poder probar el log.
 */
const destino = env.nodeEnv === "test" ? process.stdout : undefined;

export const logger = pino({
    level: env.logLevel,
    // El nivel viaja como palabra (`"level":"error"`), no como el número 50:
    // un JSON que se lee sin tabla de conversión delante.
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Nunca registrar credenciales ni tokens: si un día se registra el cuerpo o
    // las cabeceras de una petición, esto ya está puesto.
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers['set-cookie']",
            "*.password",
            "*.token",
        ],
        censor: "[oculto]",
    },
    ...(salidaLegible
        ? {
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "HH:MM:ss",
                    // Sin ocultar `req`/`res`, cada petición vuelca sus cabeceras
                    // completas en la consola: sustituir morgan por eso habría sido
                    // un cambio a peor. Lo que hace falta va en el mensaje.
                    ignore: "pid,hostname,req,res,responseTime",
                    messageFormat: "{msg}  {responseTime}ms  [{req.id}]",
                },
            },
        }
        : {}),
}, destino);

/**
 * Identificador de petición. Si llega uno por cabecera se respeta —detrás de un
 * proxy o de otro servicio, la traza ya viene empezada y romperla aquí obligaría
 * a cruzar dos identificadores a mano—; si no, se genera.
 */
export function generarRequestId(req: IncomingMessage, res: ServerResponse): string {
    const entrante = req.headers["x-request-id"];
    const id = (Array.isArray(entrante) ? entrante[0] : entrante) || randomUUID();
    // Devolverlo al cliente es lo que hace útil el identificador: quien reporta
    // un fallo puede citarlo y con él se recuperan todas las líneas de esa llamada.
    res.setHeader("x-request-id", id);
    return id;
}
