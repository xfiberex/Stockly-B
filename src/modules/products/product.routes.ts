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
import { productController } from "@/modules/products/product.controller";

export const productRouter = Router();

productRouter.use(requireAuth);

// Lectura — cualquier usuario autenticado
productRouter.get("/", productController.getProducts);
productRouter.get("/export", productController.exportProducts);
productRouter.get("/:id", productController.getProductById);
productRouter.get("/:id/movements", productController.getProductMovements);
productRouter.get("/:id/movements/export", productController.exportProductMovements);
productRouter.get("/:id/price-history", productController.getPriceHistory);

// Escritura — solo ADMIN
productRouter.post("/import", requireRole("ADMIN"), validate(importProductsSchema), productController.importProducts);
// T2-32: la firma se comprueba **después** de multer, que es cuando existe el buffer, y
// antes de validar el resto: si el archivo no es una imagen, no hay nada más que mirar.
productRouter.post("/", requireRole("ADMIN"), upload.single("image"), verificarFirmaDeImagen, validate(createProductSchema), productController.createProduct);
productRouter.put("/:id", requireRole("ADMIN"), upload.single("image"), verificarFirmaDeImagen, validate(updateProductSchema), productController.updateProduct);
productRouter.delete("/:id", requireRole("ADMIN"), productController.deleteProduct);
productRouter.patch("/:id/restore", requireRole("ADMIN"), productController.restoreProduct);
productRouter.post("/:id/movements", requireRole("ADMIN"), validate(createManualMovementSchema), productController.createManualMovement);
productRouter.patch("/bulk-stock", requireRole("ADMIN"), validate(bulkStockSchema), productController.bulkUpdateStock);
