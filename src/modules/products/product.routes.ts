import { Router } from "express";
import { upload } from "@/shared/middlewares/upload.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createProductSchema, updateProductSchema, importProductsSchema } from "@/modules/products/product.validator";
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    restoreProduct,
    exportProducts,
    importProducts,
    getProductMovements,
} from "@/modules/products/product.controller";

export const productRouter = Router();

productRouter.use(requireAuth);

// Lectura — cualquier usuario autenticado
productRouter.get("/", getProducts);
productRouter.get("/export", exportProducts);
productRouter.get("/:id", getProductById);
productRouter.get("/:id/movements", getProductMovements);

// Escritura — solo ADMIN
productRouter.post("/import", requireRole("ADMIN"), validate(importProductsSchema), importProducts);
productRouter.post("/", requireRole("ADMIN"), upload.single("image"), validate(createProductSchema), createProduct);
productRouter.put("/:id", requireRole("ADMIN"), upload.single("image"), validate(updateProductSchema), updateProduct);
productRouter.delete("/:id", requireRole("ADMIN"), deleteProduct);
productRouter.patch("/:id/restore", requireRole("ADMIN"), restoreProduct);
