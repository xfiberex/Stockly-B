import { Router } from "express";
import { upload } from "@/shared/middlewares/upload.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createProductSchema, updateProductSchema } from "@/modules/products/product.validator";
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    restoreProduct,
} from "@/modules/products/product.controller";

export const productRouter = Router();

// Rutas para productos
productRouter.get("/", getProducts);

// Rutas para obtener un producto por ID
productRouter.get("/:id", getProductById);

// Ruta para crear un producto (con validación y manejo de archivos)
productRouter.post("/",
    upload.single("image"),
    validate(createProductSchema),
    createProduct
);

// Ruta para actualizar un producto (con validación y manejo de archivos)
productRouter.put("/:id",
    upload.single("image"),
    validate(updateProductSchema),
    updateProduct
);

// Ruta para eliminar un producto (soft delete)
productRouter.delete("/:id", deleteProduct);

// Ruta para restaurar un producto eliminado
productRouter.patch("/:id/restore", restoreProduct);
