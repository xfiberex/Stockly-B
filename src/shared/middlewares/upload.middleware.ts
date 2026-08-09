import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import "@/shared/lib/cloudinary";
import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";

// Sin credenciales de Cloudinary el servidor arranca igual (T1-26); es aquí, en el
// punto de uso, donde la falta se convierte en un error legible en vez de un 500.
function requireCloudinary(): void {
    if (!env.cloudinary.configured) {
        throw new HttpError(
            503,
            "La subida de imágenes no está configurada. Define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el .env.",
        );
    }
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 2;

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    // Primer filtro, por lo que **dice** el cliente. Se conserva porque descarta lo
    // evidente antes de leer nada, pero no es una comprobación de seguridad: la
    // cabecera la escribe quien envía. Quien decide de verdad es `verificarFirmaDeImagen`.
    fileFilter: (_req: Request, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido. Usa: ${ALLOWED_TYPES.join(", ")}`));
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
    if (!real) {
        throw new HttpError(
            422,
            `El archivo no es una imagen válida. Se admiten: ${ALLOWED_TYPES.join(", ")}.`,
        );
    }

    req.file.mimetype = real;
    next();
}

export async function uploadToCloudinary(
    buffer: Buffer,
    folder: string,
): Promise<{ url: string; publicId: string }> {
    requireCloudinary();
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream({ folder, resource_type: "image" }, (error, result) => {
                if (error || !result) return reject(error ?? new Error("Upload failed"));
                resolve({ url: result.secure_url, publicId: result.public_id });
            })
            .end(buffer);
    });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
    requireCloudinary();
    await cloudinary.uploader.destroy(publicId);
}
