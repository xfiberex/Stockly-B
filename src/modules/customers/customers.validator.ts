import { z } from "zod";

/**
 * T5-06 — alta y edición comparten campos: el formulario manda el cliente entero.
 *
 * En la edición, un campo **ausente no se toca** y uno **vacío se borra**; el servicio hace esa
 * distinción. El correo se normaliza allí, no aquí: el validador solo dice si tiene forma de correo.
 */
const campos = {
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres"),
    email: z.string().trim().email("Email no válido").max(254, "El email no puede superar 254 caracteres").optional().or(z.literal("")),
    phone: z.string().trim().max(30, "El teléfono no puede superar 30 caracteres").optional(),
    notes: z.string().trim().max(1000, "Las notas no pueden superar 1000 caracteres").optional(),
};

export const createCustomerSchema = z.object(campos);
export const updateCustomerSchema = z.object(campos);

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
