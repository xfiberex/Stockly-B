import { z } from "zod";

const VALID_CATEGORIES = ["Electrónica", "Periféricos", "Audio", "Accesorios", "Muebles", "Otros"] as const;

export const createProductSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres"),
    description: z.string().trim().max(1000, "La descripción no puede superar 1000 caracteres").optional(),
    // z.coerce convierte strings de FormData a números automáticamente
    price: z.coerce.number({ error: "El precio es obligatorio" }).positive("El precio debe ser mayor a 0"),
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    category: z.enum(VALID_CATEGORIES, `Categoría inválida. Opciones: ${VALID_CATEGORIES.join(", ")}`),
});

export const updateProductSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200, "El nombre no puede superar 200 caracteres").optional(),
    description: z.string().trim().max(1000, "La descripción no puede superar 1000 caracteres").optional(),
    price: z.coerce.number().positive("El precio debe ser mayor a 0").optional(),
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    category: z.enum(VALID_CATEGORIES, `Categoría inválida. Opciones: ${VALID_CATEGORIES.join(", ")}`).optional(),
    removeImage: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
