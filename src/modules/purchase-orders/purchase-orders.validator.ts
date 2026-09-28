import { z } from "zod";

const itemSchema = z.object({
    productId: z.string().uuid().optional(),
    productName: z.string().trim().min(1, "El nombre del producto es obligatorio").max(200),
    quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
    unitPrice: z.number().positive("El precio unitario debe ser mayor a 0"),
});

export const createPurchaseOrderSchema = z.object({
    supplierId: z.string().uuid().optional(),
    notes: z.string().trim().max(1000).optional(),
    items: z.array(itemSchema).min(1, "Se requiere al menos un ítem"),
});

export const updatePurchaseOrderSchema = z.object({
    supplierId: z.string().uuid().optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(["PENDING", "RECEIVED", "CANCELLED"]).optional(),
});

/**
 * T5-04 — `POST /purchase-orders/:id/receipts`. `status` en `PATCH` sigue sin admitir
 * `PARTIALLY_RECEIVED`: a ese estado se llega recibiendo, no escribiéndolo.
 */
export const receivePurchaseOrderSchema = z.object({
    items: z
        .array(
            z.object({
                itemId: z.string().uuid(),
                quantity: z.number().int().positive("La cantidad recibida debe ser mayor a 0"),
            }),
        )
        .min(1, "Se requiere al menos una línea")
        // Dos entradas para la misma línea sumarían en silencio y esquivarían el tope por línea.
        .refine((items) => new Set(items.map((i) => i.itemId)).size === items.length, "Cada línea solo puede aparecer una vez"),
});

/**
 * T5-05 — `POST /purchase-orders/suggestions`. El precio es obligatorio aunque la sugerencia no
 * lo trajera: sin último precio pagado ni coste, lo escribe quien revisa, y nunca se rellena
 * con el de venta (ver `reposicion.service.ts`).
 */
export const generarDesdeSugerenciasSchema = z.object({
    items: z
        .array(
            z.object({
                productId: z.string().uuid(),
                quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
                unitPrice: z.number().positive("El precio unitario debe ser mayor a 0"),
            }),
        )
        .min(1, "Se requiere al menos una línea")
        // Techo del lote: es lo que cabe en unas pocas páginas de sugerencias, y una sola
        // transacción no debería crecer sin límite por lo que mande un cliente.
        .max(500, "No se pueden generar más de 500 líneas a la vez")
        // El mismo producto dos veces acabaría en dos líneas de la misma orden.
        .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "Cada producto solo puede aparecer una vez"),
});
