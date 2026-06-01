import { Router } from "express";
import { productRouter } from "@/modules/products";
import { authRouter } from "@/modules/auth";
import { categoriesRouter } from "@/modules/categories";
import { brandsRouter } from "@/modules/brands";
import { suppliersRouter } from "@/modules/suppliers";
import { purchaseOrdersRouter } from "@/modules/purchase-orders";
import { reportsRouter } from "@/modules/reports";
import { tagsRouter } from "@/modules/tags";
import { usersRouter } from "@/modules/users";
import { settingsRouter } from "@/modules/settings";
import { auditLogsRouter } from "@/modules/audit-logs";
import { saleOrdersRouter } from "@/modules/sale-orders";

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
router.use("/sale-orders", saleOrdersRouter);
router.use("/reports", reportsRouter);
router.use("/tags", tagsRouter);
router.use("/users", usersRouter);
router.use("/settings", settingsRouter);
router.use("/audit-logs", auditLogsRouter);
