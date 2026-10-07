import { z } from "zod";
import { SETTINGS_CATALOG } from "./settings.service";
import { zonaHorariaCanonica } from "@/shared/lib/zonaHoraria";
import { TASA_DE_IMPUESTO_MAXIMA, esTasaDeImpuestoValida, motivoSimboloDeMonedaInvalido } from "@/contratos/api";

// El esquema se genera desde el catálogo: añadir un ajuste nuevo a
// SETTINGS_CATALOG lo valida automáticamente, sin tocar este archivo.
const validadorPorTipo = {
    boolean: z.boolean(),
    number: z.number(),
    string: z.string(),
} as const;

const shape: Record<string, z.ZodTypeAny> = {};
for (const def of SETTINGS_CATALOG) {
    shape[def.key] = validadorDe(def).optional();
}

/** El validador del tipo, estrechado con los límites que declare el propio ajuste (T5-05). */
function validadorDe(def: (typeof SETTINGS_CATALOG)[number]): z.ZodTypeAny {
    // T5-09 — se guarda la forma canónica: `america/santo_domingo` se acepta y se guarda
    // como `America/Santo_Domingo`, que es como la muestra el selector.
    if ("zonaHoraria" in def && def.zonaHoraria) {
        return z.string().transform((valor, ctx) => {
            const canonica = zonaHorariaCanonica(valor);
            if (!canonica) {
                ctx.addIssue({ code: "custom", message: "No es una zona horaria IANA válida (por ejemplo, America/Santo_Domingo)" });
                return z.NEVER;
            }
            return canonica;
        });
    }
    // T6-03 — sin recortar: un espacio dentro del símbolo es un símbolo que no vale, no uno
    // que haya que arreglar en silencio.
    if ("simboloDeMoneda" in def) {
        return z.string().refine((valor) => motivoSimboloDeMonedaInvalido(valor) === null, {
            message: "De 1 a 5 caracteres: letras sin acento, $ / . y los signos € £ ¥ ¢ ƒ (por ejemplo, RD$)",
        });
    }
    // T6-05 — la misma función que usa el formulario: de 0 a 100 y con dos decimales como mucho.
    if ("tasaDeImpuesto" in def) {
        return z.number().refine(esTasaDeImpuestoValida, {
            message: `Un porcentaje entre 0 y ${TASA_DE_IMPUESTO_MAXIMA}, con dos decimales como mucho`,
        });
    }
    if (def.type === "string" && "maxLength" in def) return textoDeUnaLinea(def.maxLength, "correo" in def);
    if (def.type !== "number") return validadorPorTipo[def.type];
    let numero = z.number();
    if ("entero" in def && def.entero) numero = numero.int();
    if ("min" in def) numero = numero.min(def.min);
    if ("max" in def) numero = numero.max(def.max);
    return numero;
}

/**
 * T6-03 — un dato del negocio: una línea de texto, recortada y con tope. Vacía vale, que es
 * como se borra. **Sin caracteres de control**: acaba en la cabecera de un PDF, donde un salto
 * de línea descoloca todo lo que viene debajo.
 */
function textoDeUnaLinea(maximo: number, correo: boolean): z.ZodTypeAny {
    const texto = z
        .string()
        .trim()
        .max(maximo, `No puede tener más de ${maximo} caracteres`)
        .regex(/^\P{Cc}*$/u, "No puede llevar saltos de línea ni caracteres de control");
    if (!correo) return texto;
    return texto.refine((valor) => valor === "" || z.email().safeParse(valor).success, {
        message: "No es un correo electrónico válido",
    });
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
