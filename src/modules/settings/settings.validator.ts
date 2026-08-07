import { z } from "zod";
import { SETTINGS_CATALOG } from "./settings.service";

// El esquema se genera desde el catálogo: añadir un ajuste nuevo a
// SETTINGS_CATALOG lo valida automáticamente, sin tocar este archivo.
const validadorPorTipo = {
    boolean: z.boolean(),
    number: z.number(),
    string: z.string(),
} as const;

const shape: Record<string, z.ZodTypeAny> = {};
for (const def of SETTINGS_CATALOG) {
    shape[def.key] = validadorPorTipo[def.type].optional();
}

// `.strict()` en lugar del `.strip()` por defecto: una clave desconocida debe ser
// un 422, no un 200 silencioso. El frontend enviaba `{ updates: {...} }` y el
// backend respondía 200 sin persistir nada — así es como T1-05 sobrevivió tanto
// tiempo. Todas las claves son opcionales porque es un PATCH parcial, pero se
// exige al menos una: un cuerpo vacío también era un 200 sin efecto.
export const updateSettingsSchema = z
    .object(shape)
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
        message: "Debe enviarse al menos un ajuste del catálogo",
    });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
