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
