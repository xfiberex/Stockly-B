import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import "@/shared/lib/cloudinary";
import { Request } from "express";
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
    fileFilter: (_req: Request, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido. Usa: ${ALLOWED_TYPES.join(", ")}`));
        }
    },
});

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
