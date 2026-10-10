import { z } from "zod";
import { rolSchema } from "@/contratos/api";

/**
 * T6-10 — la invitación. Nombre y correo con las mismas reglas que el registro público
 * (`auth.validator.ts`); **no hay contraseña**: la pone la persona invitada con su enlace.
 * El rol sale del contrato, como en `PATCH /users/:id/role`.
 */
export const invitarUsuarioSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre no puede superar 80 caracteres"),
    email: z.string().trim().toLowerCase().email("El correo electrónico no es válido"),
    role: rolSchema,
});
