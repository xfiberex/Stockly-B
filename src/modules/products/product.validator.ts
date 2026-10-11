import { z } from "zod";
import { LARGO_MAXIMO_DE_CODIGO_DE_LOTE, esDiaValido, motivoCodigoDeBarrasInvalido } from "@/contratos/api";

// Normaliza "" → undefined: los formularios envían "" para "sin categoría/marca/proveedor".
const uuidOptional = z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().uuid("Debe ser un UUID válido").optional(),
);

// `multipart/form-data` no tiene arrays: el cliente repite la clave `tagIds` una vez
// por etiqueta, así que llega como cadena cuando hay una sola y como array cuando hay
// varias. La cadena vacía es la forma de decir «ninguna etiqueta» — sin ella no se
// podrían quitar todas, porque una clave ausente significa «no tocar las etiquetas».
const tagIdsOptional = z.preprocess(
    (v) => {
        if (v === undefined || v === null) return undefined;
        if (v === "") return [];
        const lista = Array.isArray(v) ? v : [v];
        return lista.filter((id) => id !== "");
    },
    z.array(z.string().uuid("Cada etiqueta debe ser un UUID válido")).optional(),
);

// T5-01 — el coste a mano. Llega por `multipart/form-data`, así que es cadena, y la vacía es
// lo que manda un campo sin rellenar. Al **crear** eso es «sin coste»; al **editar** es
// «quitar el coste», porque el formulario manda el campo siempre y una clave ausente ya
// significa «no tocarlo». Sin esa distinción, un coste puesto por error no se podría borrar.
// El tope es el de `Decimal(12, 4)`.
const COSTE_MAXIMO = 99_999_999;
const costeNoNegativo = z.coerce
    .number()
    .nonnegative("El coste no puede ser negativo")
    .max(COSTE_MAXIMO, "El coste es demasiado alto");
const costeAlCrear = z.preprocess((v) => (v === "" ? undefined : v), costeNoNegativo.optional());
const costeAlEditar = z.preprocess((v) => (v === "" ? null : v), costeNoNegativo.nullable().optional());

// T5-08 — el código de barras. La regla vive en el contrato (`motivoCodigoDeBarrasInvalido`),
// que es la que aplica también el formulario; aquí solo se le pone el mensaje. Como el coste,
// la cadena vacía es «sin código» al crear y «quitarlo» al editar.
const MENSAJE_CODIGO = {
    largo: "El código de barras debe tener entre 1 y 48 caracteres",
    caracteres: "El código de barras solo admite letras, cifras y símbolos, sin espacios ni acentos",
    digitoDeControl: "El dígito de control no cuadra: revisa el código, es un EAN o UPC mal escrito",
} as const;
const codigoDeBarras = z.string().trim().superRefine((codigo, ctx) => {
    const motivo = motivoCodigoDeBarrasInvalido(codigo);
    if (motivo) ctx.addIssue({ code: "custom", message: MENSAJE_CODIGO[motivo] });
});
const codigoAlCrear = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), codigoDeBarras.optional());
const codigoAlEditar = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), codigoDeBarras.nullable().optional());

// T5-15 — «lleva lotes». Por `multipart/form-data` llega como la cadena `"true"` o `"false"`;
// `z.coerce.boolean()` daría por verdadera cualquier cadena no vacía, `"false"` incluida.
const casilla = z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v === "" ? undefined : v),
    z.boolean({ error: "Debe ser verdadero o falso" }).optional(),
);

// T5-15 — el lote de una entrada: su fecha de caducidad (`AAAA-MM-DD`) y, si se quiere, su código.
// Las cadenas vacías son un campo sin rellenar.
const caducidad = z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().refine(esDiaValido, "La caducidad debe ser una fecha AAAA-MM-DD").optional(),
);
const codigoDeLote = z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(LARGO_MAXIMO_DE_CODIGO_DE_LOTE, `El lote no puede superar ${LARGO_MAXIMO_DE_CODIGO_DE_LOTE} caracteres`).optional(),
);

export const importProductsSchema = z.object({
    products: z
        .array(
            z.object({
                name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
                description: z.string().trim().max(1000).optional(),
                price: z.coerce.number().positive("El precio debe ser mayor a 0"),
                stock: z.coerce.number().int().min(0).optional(),
                categoryName: z.string().trim().max(100).optional(),
                brandName: z.string().trim().max(100).optional(),
                isActive: z.boolean().optional(),
            }),
        )
        .min(1, "Se requiere al menos un producto")
        .max(1000, "Máximo 1000 productos por importación"),
});

export const createProductSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "El nombre no puede superar 200 caracteres"),
    description: z.string().trim().max(1000, "La descripción no puede superar 1000 caracteres").optional(),
    sku: z.string().trim().max(100, "El SKU no puede superar 100 caracteres").optional(),
    barcode: codigoAlCrear,
    price: z.coerce.number({ error: "El precio es obligatorio" }).positive("El precio debe ser mayor a 0"),
    costPrice: costeAlCrear,
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    minStock: z.coerce.number().int("El stock mínimo debe ser un entero").min(0, "El stock mínimo debe ser mayor o igual a 0").optional(),
    categoryId: uuidOptional,
    brandId: uuidOptional,
    supplierId: uuidOptional,
    tagIds: tagIdsOptional,
    // T5-14 — a qué almacén va el stock inicial. Como los demás, `""` es «no lo dice».
    warehouseId: uuidOptional,
    // T5-15 — si lleva lotes y, entonces, el del stock inicial.
    tracksLots: casilla,
    lotExpiresAt: caducidad,
    lotCode: codigoDeLote,
});

export const updateProductSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200, "El nombre no puede superar 200 caracteres").optional(),
    description: z.string().trim().max(1000, "La descripción no puede superar 1000 caracteres").optional(),
    sku: z.string().trim().max(100, "El SKU no puede superar 100 caracteres").optional(),
    barcode: codigoAlEditar,
    price: z.coerce.number().positive("El precio debe ser mayor a 0").optional(),
    costPrice: costeAlEditar,
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    minStock: z.coerce.number().int("El stock mínimo debe ser un entero").min(0).optional(),
    categoryId: uuidOptional,
    brandId: uuidOptional,
    supplierId: uuidOptional,
    tagIds: tagIdsOptional,
    removeImage: z.string().optional(),
    // T5-14 — el almacén que absorbe la diferencia de `stock`.
    warehouseId: uuidOptional,
    // T5-15 — marcarlo o desmarcarlo. Aquí no hay lote: el stock de un producto que los lleva
    // sube con una entrada, que es la que dice de cuál.
    tracksLots: casilla,
});

export const createManualMovementSchema = z
    .object({
        type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
        quantity: z.number().int().min(0, "La cantidad no puede ser negativa"),
        reason: z.string().trim().min(1, "El motivo es obligatorio").max(200),
        note: z.string().trim().max(500).optional(),
        warehouseId: z.string().uuid("Almacén inválido").optional(),
        // T5-15 — el lote. `lotId` vale para los tres tipos: en una entrada suma a ese lote, en
        // una salida saca solo de él y en un ajuste fija lo que hay **de él**. La fecha y el
        // código son la otra forma de decirlo en una entrada: el lote se crea si no existía.
        lotId: z.string().uuid("Lote inválido").optional(),
        expiresAt: caducidad,
        lotCode: codigoDeLote,
    })
    // Un ajuste **a cero** sí existe —es como se da de baja un lote caducado—; una entrada o
    // una salida de cero unidades, no.
    .refine((m) => m.type === "ADJUSTMENT" || m.quantity > 0, { path: ["quantity"], message: "La cantidad debe ser mayor a 0" });

export const bulkStockSchema = z.object({
    items: z
        .array(
            z.object({
                productId: z.string().uuid(),
                stock: z.number().int().min(0),
            }),
        )
        .min(1, "Se requiere al menos un producto"),
    reason: z.string().trim().max(200).optional(),
    warehouseId: z.string().uuid("Almacén inválido").optional(),
});
