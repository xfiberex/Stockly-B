import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from "./purchase-orders.validator";
import { purchaseOrderController } from "./purchase-orders.controller";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get("/", purchaseOrderController.getAllOrders);
purchaseOrdersRouter.get("/export", requireRole("ADMIN"), purchaseOrderController.exportOrders);
purchaseOrdersRouter.get("/:id", purchaseOrderController.getOrderById);
purchaseOrdersRouter.post("/", requireRole("ADMIN"), validate(createPurchaseOrderSchema), purchaseOrderController.createOrder);
purchaseOrdersRouter.patch("/:id", requireRole("ADMIN"), validate(updatePurchaseOrderSchema), purchaseOrderController.updateOrder);
purchaseOrdersRouter.delete("/:id", requireRole("ADMIN"), purchaseOrderController.deleteOrder);
