import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import "../../shared/lib/cloudinary";
import { Request } from "express";

// Configuración de multer para aceptar solo imágenes y limitar el tamaño a 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 2;

// Middleware para manejar la subida de archivos con multer
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

// Función para subir una imagen a Cloudinary
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "image" }, (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      })
      .end(buffer);
  });
}

// Función para eliminar una imagen de Cloudinary usando su publicId
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}