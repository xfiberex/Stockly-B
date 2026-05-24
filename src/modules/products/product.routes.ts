import { Router } from "express";
import { upload } from "../../common/middlewares/upload.middleware";
import { validateRequest } from "../../common/middlewares/validate.middleware";
import { createProductValidators, updateProductValidators } from "./product.validator";
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, restoreProduct } from "./product.controller";

export const productRouter = Router();

// Rutas para productos
productRouter.get("/", getProducts);

// Rutas para obtener un producto por ID
productRouter.get("/:id", getProductById);

// Ruta para crear un producto (con validación y manejo de archivos)
productRouter.post("/", 
    upload.single("image"),
    createProductValidators,
    validateRequest,
    createProduct
);

// Ruta para actualizar un producto (con validación y manejo de archivos)
productRouter.put("/:id", 
    upload.single("image"),
    updateProductValidators,
    validateRequest,
    updateProduct
);

// Ruta para eliminar un producto (soft delete)
productRouter.delete("/:id", deleteProduct);

// Ruta para restaurar un producto eliminado
productRouter.patch("/:id/restore", restoreProduct);