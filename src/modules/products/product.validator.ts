import { z } from "zod";

const uuidOptional = z.string().uuid("Debe ser un UUID válido").optional();

export const importProductsSchema = z.object({
    products: z
        .array(
            z.object({
                name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
                description: z.string().trim().max(1000).optional(),
                price: z.coerce.number().positive("El precio debe ser mayor a 0"),
                stock: z.coerce.number().int().min(0).optional(),
                // Acepta nombre de categoría/marca para importaciones amigables (se resuelve a ID en el servicio)
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
    price: z.coerce.number({ error: "El precio es obligatorio" }).positive("El precio debe ser mayor a 0"),
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    categoryId: uuidOptional,
    brandId: uuidOptional,
    supplierId: uuidOptional,
});

export const updateProductSchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200, "El nombre no puede superar 200 caracteres").optional(),
    description: z.string().trim().max(1000, "La descripción no puede superar 1000 caracteres").optional(),
    price: z.coerce.number().positive("El precio debe ser mayor a 0").optional(),
    stock: z.coerce.number().int("El stock debe ser un entero").min(0, "El stock debe ser mayor o igual a 0").optional(),
    categoryId: uuidOptional,
    brandId: uuidOptional,
    supplierId: uuidOptional,
    removeImage: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
