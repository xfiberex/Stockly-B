import { logger } from "@/shared/lib/logger";

/**
 * T6-07 — trae el logo del negocio para incrustarlo en el comprobante de venta.
 *
 * Es **la única petición que el servidor hace a una URL guardada**, dentro de una petición de
 * un usuario, y por eso lleva cuatro cerrojos:
 *
 * - **Nunca rechaza.** Sin logo, con Cloudinary caído o con lo que sea que responda, devuelve
 *   `null` y el comprobante sale sin logo. Un papel sin logo es un papel; un 500, no.
 * - **Tope de tiempo.** Quien espera es alguien con un cliente delante.
 * - **Solo a Cloudinary, por HTTPS y sin seguir redirecciones.** La URL la escribe únicamente
 *   `settingsService.guardarLogo`, con lo que devuelve la subida, así que hoy no puede ser
 *   otra cosa; pero si un día una fila de `app_settings` dijera `http://169.254.169.254/…`,
 *   esto es lo que impide que el servidor vaya a buscarlo.
 * - **Solo PNG o JPEG, y con tope de peso.** Es lo que PDFKit sabe incrustar; se mira la firma
 *   del archivo, no la cabecera. `guardarLogo` lo guarda como PNG de 600 px como mucho, así que
 *   uno legítimo queda muy por debajo.
 */

/** Dónde sirve Cloudinary lo subido (`secure_url`). */
const HOST_DE_CLOUDINARY = "res.cloudinary.com";

export const TIEMPO_MAXIMO_DEL_LOGO_MS = 3000;
export const PESO_MAXIMO_DEL_LOGO = 2 * 1024 * 1024;

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

const empiezaPor = (datos: Buffer, firma: Buffer) => datos.subarray(0, firma.length).equals(firma);

/** Si `url` es una dirección a la que el servidor puede ir a por el logo. */
function esUrlDeLogo(url: string): boolean {
    try {
        const { protocol, hostname, username, password, port } = new URL(url);
        return protocol === "https:" && hostname === HOST_DE_CLOUDINARY && !username && !password && !port;
    } catch {
        return false;
    }
}

export async function traerLogoDelNegocio(
    url: string | null,
    opciones: { tiempoMaximoMs?: number } = {},
): Promise<Buffer | null> {
    if (!url) return null;
    if (!esUrlDeLogo(url)) {
        logger.warn({ url }, "El logo del negocio no apunta a Cloudinary: el comprobante sale sin él");
        return null;
    }

    try {
        const respuesta = await fetch(url, {
            redirect: "error",
            signal: AbortSignal.timeout(opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_DEL_LOGO_MS),
        });
        if (!respuesta.ok) throw new Error(`Cloudinary respondió ${respuesta.status}`);
        // Lo que declara, antes de leerlo; y lo que pesa de verdad, después.
        if (Number(respuesta.headers.get("content-length") ?? 0) > PESO_MAXIMO_DEL_LOGO) throw new Error("El logo pesa demasiado");

        const datos = Buffer.from(await respuesta.arrayBuffer());
        if (datos.length > PESO_MAXIMO_DEL_LOGO) throw new Error("El logo pesa demasiado");
        if (!empiezaPor(datos, FIRMA_PNG) && !empiezaPor(datos, FIRMA_JPEG)) throw new Error("El logo no es PNG ni JPEG");

        return datos;
    } catch (err) {
        logger.warn({ err, url }, "No se pudo traer el logo del negocio: el comprobante sale sin él");
        return null;
    }
}
