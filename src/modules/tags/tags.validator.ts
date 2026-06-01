import { z } from "zod";

export const createTagSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(50),
    color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "El color debe ser un hex válido (#RRGGBB)").optional(),
});

export const updateTagSchema = createTagSchema.partial();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
