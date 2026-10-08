import { z } from "zod";
import { documentoSchema } from "@/modules/customers/customers.validator";
import { MAXIMO_DE_LINEAS_DE_MOSTRADOR } from "@/contratos/api";

const itemSchema = z.object({
    productId: z.string().uuid().optional(),
    productName: z.string().trim().min(1, "El nombre del producto es obligatorio").max(200),
    quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
    unitPrice: z.number().nonnegative("El precio unitario no puede ser negativo"),
});

export const createSaleOrderSchema = z.object({
    customerId: z.string().uuid("Cliente inválido").optional(),
    customerName: z.string().trim().max(200).optional(),
    customerEmail: z.email("Correo del cliente inválido").optional(),
    customerPhone: z.string().trim().max(30).optional(),
    customerDocument: documentoSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
    items: z.array(itemSchema).min(1, "Se requiere al menos un ítem"),
});

/**
 * T6-08 — la venta de mostrador. **Aquí no hay `unitPrice` ni `productName`, y es a propósito**:
 * `z.object` descarta lo que no declara, así que un precio enviado en una línea no llega al
 * servicio. El precio lo pone el producto.
 */
export const counterSaleSchema = z.object({
    customerId: z.string().uuid("Cliente inválido").optional(),
    customerName: z.string().trim().max(200).optional(),
    customerEmail: z.email("Correo del cliente inválido").optional(),
    customerPhone: z.string().trim().max(30).optional(),
    customerDocument: documentoSchema.optional(),
    items: z
        .array(
            z.object({
                productId: z.string().uuid("Producto inválido"),
                // El tope es el de un `integer` de la base: más arriba el descuento reventaría con un 500.
                quantity: z.number().int().positive("La cantidad debe ser mayor a 0").max(1_000_000, "La cantidad es demasiado grande"),
            }),
        )
        .min(1, "Se requiere al menos un ítem")
        .max(MAXIMO_DE_LINEAS_DE_MOSTRADOR, `Una venta de mostrador admite ${MAXIMO_DE_LINEAS_DE_MOSTRADOR} líneas como mucho`),
});

export const updateSaleOrderSchema = z.object({
    customerId: z.string().uuid("Cliente inválido").nullable().optional(),
    customerName: z.string().trim().max(200).optional(),
    customerEmail: z.email("Correo del cliente inválido").optional(),
    customerPhone: z.string().trim().max(30).optional(),
    customerDocument: documentoSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(["PENDING", "SHIPPED", "CANCELLED"]).optional(),
});
