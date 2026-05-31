import { z } from "zod";

export const createBrandSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre no puede superar 100 caracteres"),
    description: z.string().trim().max(500, "La descripción no puede superar 500 caracteres").optional(),
});

export const updateBrandSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100, "El nombre no puede superar 100 caracteres"),
    description: z.string().trim().max(500, "La descripción no puede superar 500 caracteres").optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
