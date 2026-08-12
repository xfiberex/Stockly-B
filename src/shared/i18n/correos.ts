import { correosEs, type ClaveDeCorreo } from "@/shared/i18n/correos.es";
import { correosEn } from "@/shared/i18n/correos.en";
import { $Enums } from "@/generated/prisma/client";

/**
 * Traducción de los correos (T4-12).
 *
 * El idioma es el de la columna `users.idioma`, no el de una petición: un correo puede
 * salir mucho después de que su destinatario cerrara el navegador —o sin que haya tocado
 * nada, como la alerta de bajo stock que dispara una venta ajena—.
 */
export type Idioma = $Enums.Idioma;

const CATALOGOS: Record<Idioma, Record<ClaveDeCorreo, string>> = {
    ES: correosEs,
    EN: correosEn,
};

export const IDIOMA_POR_DEFECTO: Idioma = "ES";

export type Valores = Record<string, string | number>;

/**
 * **Los huecos se sustituyen todos a la vez, no en cadena.**
 *
 * Un `replace` por valor, encadenado, deja que el texto ya sustituido vuelva a mirarse: si
 * el nombre de un producto es literalmente `{minimo}` —y un SKU o un nombre puede serlo—,
 * la pasada siguiente lo cambiaría por el stock mínimo. Con un solo recorrido, lo que entra
 * como valor ya no se vuelve a leer.
 */
function interpolar(plantilla: string, valores: Valores = {}): string {
    return plantilla.replace(/\{(\w+)\}/g, (original, clave: string) =>
        clave in valores ? String(valores[clave]) : original,
    );
}

export function traducirCorreo(idioma: Idioma, clave: ClaveDeCorreo, valores?: Valores): string {
    const catalogo = CATALOGOS[idioma] ?? CATALOGOS[IDIOMA_POR_DEFECTO];
    return interpolar(catalogo[clave], valores);
}

/**
 * El valor del atributo `lang` del correo.
 *
 * Un cliente de correo lo usa para lo mismo que el navegador: elegir voz en un lector y
 * decidir si ofrece traducir el mensaje. `ES`/`EN` son los nombres del enum de la base;
 * lo que va en el HTML es la etiqueta de idioma.
 */
export function etiquetaDeIdioma(idioma: Idioma): string {
    return idioma.toLowerCase();
}

export type { ClaveDeCorreo };
