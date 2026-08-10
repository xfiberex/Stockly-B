import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createSaleOrderSchema, updateSaleOrderSchema } from "./sale-orders.validator";
import { saleOrderController } from "./sale-orders.controller";

export const saleOrdersRouter = Router();

saleOrdersRouter.use(requireAuth);

saleOrdersRouter.get("/", saleOrderController.getAllSaleOrders);
saleOrdersRouter.get("/export", requireRole("ADMIN"), saleOrderController.exportSaleOrders);
saleOrdersRouter.get("/:id", saleOrderController.getSaleOrderById);
saleOrdersRouter.post("/", requireRole("ADMIN"), validate(createSaleOrderSchema), saleOrderController.createSaleOrder);
saleOrdersRouter.patch("/:id", requireRole("ADMIN"), validate(updateSaleOrderSchema), saleOrderController.updateSaleOrder);
saleOrdersRouter.delete("/:id", requireRole("ADMIN"), saleOrderController.deleteSaleOrder);
