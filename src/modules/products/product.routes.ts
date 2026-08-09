import { Router } from "express";
import { upload, verificarFirmaDeImagen } from "@/shared/middlewares/upload.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import {
    createProductSchema,
    updateProductSchema,
    importProductsSchema,
    createManualMovementSchema,
    bulkStockSchema,
} from "@/modules/products/product.validator";
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
    exportProductMovements,
    createManualMovement,
    bulkUpdateStock,
    getPriceHistory,
} from "@/modules/products/product.controller";

export const productRouter = Router();

productRouter.use(requireAuth);

// Lectura — cualquier usuario autenticado
productRouter.get("/", getProducts);
productRouter.get("/export", exportProducts);
productRouter.get("/:id", getProductById);
productRouter.get("/:id/movements", getProductMovements);
productRouter.get("/:id/movements/export", exportProductMovements);
productRouter.get("/:id/price-history", getPriceHistory);

// Escritura — solo ADMIN
productRouter.post("/import", requireRole("ADMIN"), validate(importProductsSchema), importProducts);
// T2-32: la firma se comprueba **después** de multer, que es cuando existe el buffer, y
// antes de validar el resto: si el archivo no es una imagen, no hay nada más que mirar.
productRouter.post("/", requireRole("ADMIN"), upload.single("image"), verificarFirmaDeImagen, validate(createProductSchema), createProduct);
productRouter.put("/:id", requireRole("ADMIN"), upload.single("image"), verificarFirmaDeImagen, validate(updateProductSchema), updateProduct);
productRouter.delete("/:id", requireRole("ADMIN"), deleteProduct);
productRouter.patch("/:id/restore", requireRole("ADMIN"), restoreProduct);
productRouter.post("/:id/movements", requireRole("ADMIN"), validate(createManualMovementSchema), createManualMovement);
productRouter.patch("/bulk-stock", requireRole("ADMIN"), validate(bulkStockSchema), bulkUpdateStock);
