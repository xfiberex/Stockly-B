import { z } from "zod";

export const createSupplierSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres"),
    email: z.string().trim().email("Email no válido").optional().or(z.literal("")),
    phone: z.string().trim().max(30, "El teléfono no puede superar 30 caracteres").optional(),
    notes: z.string().trim().max(1000, "Las notas no pueden superar 1000 caracteres").optional(),
});

export const updateSupplierSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200, "El nombre no puede superar 200 caracteres"),
    email: z.string().trim().email("Email no válido").optional().or(z.literal("")),
    phone: z.string().trim().max(30, "El teléfono no puede superar 30 caracteres").optional(),
    notes: z.string().trim().max(1000, "Las notas no pueden superar 1000 caracteres").optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
