import { z } from "zod";
import { MAXIMO_DE_LINEAS_DE_TRANSFERENCIA } from "@/contratos/api";

/**
 * T5-14 — una transferencia: de dónde, adónde y qué. Los dos almacenes son obligatorios —aquí
 * no hay predeterminado que valga: mover «al que toque» no es una orden—.
 */
export const createStockTransferSchema = z.object({
    fromWarehouseId: z.string().uuid("Almacén de origen inválido"),
    toWarehouseId: z.string().uuid("Almacén de destino inválido"),
    note: z.string().trim().max(500, "La nota no puede superar 500 caracteres").optional(),
    items: z
        .array(
            z.object({
                productId: z.string().uuid("Producto inválido"),
                // El tope es el de un `integer` de la base, como en el mostrador.
                quantity: z.number().int().positive("La cantidad debe ser mayor a 0").max(1_000_000, "La cantidad es demasiado grande"),
            }),
        )
        .min(1, "Se requiere al menos un producto")
        .max(MAXIMO_DE_LINEAS_DE_TRANSFERENCIA, `Una transferencia admite ${MAXIMO_DE_LINEAS_DE_TRANSFERENCIA} líneas como mucho`)
        // Dos líneas del mismo producto serían cuatro movimientos para decir lo que dicen dos.
        .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "Cada producto solo puede aparecer una vez"),
});

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
