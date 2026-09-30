import { Router } from "express";
import { upload, verificarFirmaDeImagen } from "@/shared/middlewares/upload.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
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
productRouter.get("/", permitir("GET /products"), productController.getProducts);
productRouter.get("/export", permitir("GET /products/export"), productController.exportProducts);
// T5-08 — antes de `/:id`, o «lookup» y «labels» se leerían como identificadores.
productRouter.get("/lookup", permitir("GET /products/lookup"), productController.getProductByCode);
productRouter.get("/labels", permitir("GET /products/labels"), productController.printLabels);
productRouter.get("/:id", permitir("GET /products/:id"), productController.getProductById);
productRouter.get("/:id/movements", permitir("GET /products/:id/movements"), productController.getProductMovements);
productRouter.get("/:id/movements/export", permitir("GET /products/:id/movements/export"), productController.exportProductMovements);
productRouter.get("/:id/price-history", permitir("GET /products/:id/price-history"), productController.getPriceHistory);
productRouter.get("/:id/cost-history", permitir("GET /products/:id/cost-history"), productController.getCostHistory);

// Escritura — solo ADMIN
productRouter.post("/import", permitir("POST /products/import"), validate(importProductsSchema), productController.importProducts);
// T2-32: la firma se comprueba **después** de multer, que es cuando existe el buffer, y
// antes de validar el resto: si el archivo no es una imagen, no hay nada más que mirar.
productRouter.post("/", permitir("POST /products"), upload.single("image"), verificarFirmaDeImagen, validate(createProductSchema), productController.createProduct);
productRouter.put("/:id", permitir("PUT /products/:id"), upload.single("image"), verificarFirmaDeImagen, validate(updateProductSchema), productController.updateProduct);
productRouter.delete("/:id", permitir("DELETE /products/:id"), productController.deleteProduct);
productRouter.patch("/:id/restore", permitir("PATCH /products/:id/restore"), productController.restoreProduct);
productRouter.post("/:id/movements", permitir("POST /products/:id/movements"), validate(createManualMovementSchema), productController.createManualMovement);
productRouter.patch("/bulk-stock", permitir("PATCH /products/bulk-stock"), validate(bulkStockSchema), productController.bulkUpdateStock);
