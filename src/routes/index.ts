import { Router } from "express";
import { productRouter } from "@/modules/products";
import { authRouter } from "@/modules/auth";
import { categoriesRouter } from "@/modules/categories";
import { brandsRouter } from "@/modules/brands";
import { suppliersRouter } from "@/modules/suppliers";
import { purchaseOrdersRouter } from "@/modules/purchase-orders";
import { reportsRouter } from "@/modules/reports";

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});

router.use("/auth", authRouter);
router.use("/products", productRouter);
router.use("/categories", categoriesRouter);
router.use("/brands", brandsRouter);
router.use("/suppliers", suppliersRouter);
router.use("/purchase-orders", purchaseOrdersRouter);
router.use("/reports", reportsRouter);
