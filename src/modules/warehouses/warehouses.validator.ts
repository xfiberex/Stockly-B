import { z } from "zod";

export const createWarehouseSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre no puede superar 100 caracteres"),
    address: z.string().trim().max(300, "La dirección no puede superar 300 caracteres").optional(),
});

/** La cadena vacía en `address` es «quitarla»; una clave ausente, «no tocarla». */
export const updateWarehouseSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100, "El nombre no puede superar 100 caracteres").optional(),
    address: z.string().trim().max(300, "La dirección no puede superar 300 caracteres").optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
