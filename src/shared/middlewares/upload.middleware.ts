import multer from "multer";
import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";
import "@/shared/lib/cloudinary";
import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import { PESO_MAXIMO_DE_IMAGEN_MB } from "@/contratos/api";

// Sin credenciales de Cloudinary el servidor arranca igual (T1-26); es aquí, en el
// punto de uso, donde la falta se convierte en un error legible en vez de un 500.
function requireCloudinary(): void {
    if (!env.cloudinary.configured) {
        throw new HttpError(
            503,
            "La subida de imágenes no está configurada. Define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el .env.",
            "UPLOAD_NOT_CONFIGURED",
        );
    }
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** El 422 de un archivo que no es una imagen admitida, por su cabecera o por sus bytes. */
const noEsUnaImagen = () =>
    new HttpError(
        422,
        `El archivo no es una imagen válida. Se admiten: ${ALLOWED_TYPES.join(", ")}.`,
        "INVALID_IMAGE_FILE",
        { formatos: ALLOWED_TYPES.join(", ") },
    );

export const upload = multer({
    storage: multer.memoryStorage(),
    // Pasarse del tope lo corta multer con un `MulterError`; quien lo convierte en un 413
    // con código es `error.middleware` (T6-03).
    limits: { fileSize: PESO_MAXIMO_DE_IMAGEN_MB * 1024 * 1024 },
    // Primer filtro, por lo que **dice** el cliente. Se conserva porque descarta lo
    // evidente antes de leer nada, pero no es una comprobación de seguridad: la
    // cabecera la escribe quien envía. Quien decide de verdad es `verificarFirmaDeImagen`.
    fileFilter: (_req: Request, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            // T6-03 — un `HttpError`, no un `Error` a secas: ese salía como 500.
            cb(noEsUnaImagen());
        }
    },
});

/**
 * T2-32 — firmas de los tres formatos admitidos.
 *
 * Se comprueban a mano en vez de traer `file-type` por dos razones. Son **tres
 * formatos**, doce bytes de comparación; y `file-type` es ESM puro desde la v19,
 * mientras este proyecto compila a CommonJS, así que habría entrado por un `import()`
 * dinámico —asíncrono, dentro de un middleware síncrono— a cambio de nada.
 *
 * WebP no se identifica con un prefijo continuo: es un contenedor RIFF, así que la marca
 * está partida en dos, `RIFF` al principio y `WEBP` en el byte 8, con el tamaño en medio.
 */
const FIRMAS: Array<{ mime: string; prueba: (b: Buffer) => boolean }> = [
    { mime: "image/jpeg", prueba: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    {
        mime: "image/png",
        prueba: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    {
        mime: "image/webp",
        prueba: (b) => b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
    },
];

/** El formato real del contenido, o `null` si no es ninguno de los admitidos. */
function formatoReal(buffer: Buffer): string | null {
    return FIRMAS.find(({ prueba }) => prueba(buffer))?.mime ?? null;
}

/**
 * T2-32 — rechaza lo que no sea una imagen de verdad.
 *
 * `fileFilter` no puede hacer esto: multer lo llama con los metadatos del archivo
 * **antes** de leer su contenido, así que ahí solo existe el `Content-Type` que puso el
 * cliente. Un ejecutable enviado como `image/jpeg` pasaba el filtro entero y llegaba a
 * subirse a Cloudinary, que es exactamente lo que no debe ocurrir: el archivo acaba
 * alojado en un dominio de confianza y servido con la URL que guarda el producto.
 *
 * Va **después** de `upload.single(...)`, que es cuando `req.file.buffer` existe.
 *
 * Cuando el contenido sí es una de las tres imágenes admitidas pero la cabecera dice
 * otra, **manda el contenido**: se corrige `mimetype` en vez de rechazar. Un navegador
 * que etiqueta mal un PNG no es un ataque, y lo que importaba —que sea una imagen— ya
 * está comprobado.
 */
export function verificarFirmaDeImagen(req: Request, _res: Response, next: NextFunction): void {
    // La imagen es opcional en crear y editar producto: sin archivo no hay nada que mirar.
    if (!req.file) return next();

    const real = formatoReal(req.file.buffer);
    if (!real) throw noEsUnaImagen();

    req.file.mimetype = real;
    next();
}

/** T6-03 — cómo guarda Cloudinary lo subido: en qué formato y con qué tope de tamaño. */
type OpcionesDeSubida = Pick<UploadApiOptions, "format" | "transformation">;

export async function uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    opciones: OpcionesDeSubida = {},
): Promise<{ url: string; publicId: string }> {
    requireCloudinary();
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream({ folder, resource_type: "image", ...opciones }, (error, result) => {
                // Cloudinary puede llamar de vuelta sin error y sin resultado; el mensaje
                // llega al usuario a través del manejador de errores, así que va en español.
                if (error || !result) return reject(error ?? new Error("No se pudo subir la imagen"));
                resolve({ url: result.secure_url, publicId: result.public_id });
            })
            .end(buffer);
    });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
    requireCloudinary();
    await cloudinary.uploader.destroy(publicId);
}
