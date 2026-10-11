import { z } from "zod";

/** T5-07 — abrir una sesión: todo el catálogo activo, o una categoría. */
export const createInventoryCountSchema = z.object({
    categoryId: z.string().uuid().nullable().optional(),
    // T5-14 — qué almacén se cuenta; sin él, el predeterminado.
    warehouseId: z.string().uuid("Almacén inválido").optional(),
    note: z.string().trim().max(500).optional(),
});

/**
 * Anotar lo contado. Por lotes, porque se cuenta por estantes: la pantalla manda lo que hay en
 * la página. Un producto repetido en el mismo lote es un 422: con dos cifras para el mismo
 * producto no hay forma de saber cuál es la buena.
 */
export const recordInventoryCountLinesSchema = z.object({
    items: z
        .array(
            z.object({
                productId: z.string().uuid(),
                countedQuantity: z.number().int().min(0, "La cantidad contada no puede ser negativa").max(10_000_000),
            }),
        )
        .min(1, "Se requiere al menos un producto")
        .max(500)
        .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
            message: "Un producto aparece dos veces en el mismo lote",
        }),
});

export type CreateInventoryCountInput = z.infer<typeof createInventoryCountSchema>;
export type RecordInventoryCountLinesInput = z.infer<typeof recordInventoryCountLinesSchema>;
