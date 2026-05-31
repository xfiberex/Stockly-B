import { z } from "zod";

export const createCategorySchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre no puede superar 100 caracteres"),
    description: z.string().trim().max(500, "La descripción no puede superar 500 caracteres").optional(),
});

export const updateCategorySchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100, "El nombre no puede superar 100 caracteres"),
    description: z.string().trim().max(500, "La descripción no puede superar 500 caracteres").optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
