import { z } from "zod";

/**
 * T5-05 — días que tarda el proveedor en entregar. `null` lo deja **desconocido**, y la
 * sugerencia de reposición usa entonces el plazo por defecto de Configuración; cero es válido
 * y significa que entrega en el día. Un año de techo: más allá no es un plazo, es un error al
 * teclear.
 */
const plazoDeEntrega = z
    .number()
    .int("El plazo debe ser un número entero de días")
    .min(0, "El plazo no puede ser negativo")
    .max(365, "El plazo no puede superar 365 días")
    .nullable()
    .optional();

export const createSupplierSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres"),
    email: z.string().trim().email("Email no válido").optional().or(z.literal("")),
    phone: z.string().trim().max(30, "El teléfono no puede superar 30 caracteres").optional(),
    notes: z.string().trim().max(1000, "Las notas no pueden superar 1000 caracteres").optional(),
    leadTimeDays: plazoDeEntrega,
});

export const updateSupplierSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200, "El nombre no puede superar 200 caracteres"),
    email: z.string().trim().email("Email no válido").optional().or(z.literal("")),
    phone: z.string().trim().max(30, "El teléfono no puede superar 30 caracteres").optional(),
    notes: z.string().trim().max(1000, "Las notas no pueden superar 1000 caracteres").optional(),
    leadTimeDays: plazoDeEntrega,
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
