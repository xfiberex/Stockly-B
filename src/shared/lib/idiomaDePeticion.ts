import type { Request } from "express";
import { IDIOMA_POR_DEFECTO, type Idioma } from "@/shared/i18n/correos";

const SOPORTADOS: Record<string, Idioma> = { es: "ES", en: "EN" };

/**
 * El idioma que pide una petición, sacado de `Accept-Language` (T4-12).
 *
 * **Solo hace falta cuando no hay usuario del que leerlo:** en el registro, que es el único
 * correo que se envía a alguien que todavía no tiene fila. En los demás manda
 * `users.idioma`, porque el navegador que dispara el envío no tiene por qué ser el de quien
 * lo recibe — la alerta de bajo stock la provoca una venta y la reciben los administradores.
 *
 * El frontend manda aquí su idioma **efectivo**, no el del sistema operativo: quien tiene el
 * navegador en inglés y la aplicación en español espera el correo en español. Por eso se lee
 * esta cabecera y no `navigator.language`; ver `Stockly-F/src/shared/api/axios.ts`.
 *
 * Se ignoran las calidades (`;q=`) a propósito: con dos idiomas soportados, el primero de la
 * lista que exista es la respuesta, y ordenar por `q` no cambiaría ningún caso real.
 */
export function idiomaDePeticion(req: Pick<Request, "headers">): Idioma {
    const cabecera = req.headers["accept-language"];
    if (typeof cabecera !== "string") return IDIOMA_POR_DEFECTO;

    for (const trozo of cabecera.split(",")) {
        // `en-GB;q=0.8` → `en`. La variante regional no se traduce por separado.
        const primario = trozo.trim().split(";")[0].trim().toLowerCase().split("-")[0];
        if (primario in SOPORTADOS) return SOPORTADOS[primario];
    }

    return IDIOMA_POR_DEFECTO;
}
