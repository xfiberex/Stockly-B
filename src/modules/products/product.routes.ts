import { Router } from "express";
import { upload } from "@/shared/middlewares/upload.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth } from "@/shared/middlewares/auth.middleware";
import { createProductSchema, updateProductSchema } from "@/modules/products/product.validator";
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    restoreProduct,
    exportProducts,
    importProducts,
} from "@/modules/products/product.controller";
import { importProductsSchema } from "@/modules/products/product.validator";

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get("/", getProducts);
productRouter.get("/export", exportProducts);
productRouter.post("/import", validate(importProductsSchema), importProducts);
productRouter.get("/:id", getProductById);
productRouter.post("/", upload.single("image"), validate(createProductSchema), createProduct);
productRouter.put("/:id", upload.single("image"), validate(updateProductSchema), updateProduct);
productRouter.delete("/:id", deleteProduct);
productRouter.patch("/:id/restore", restoreProduct);
