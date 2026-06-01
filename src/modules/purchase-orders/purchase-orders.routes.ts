import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from "./purchase-orders.validator";
import { getAllOrders, getOrderById, createOrder, updateOrder, deleteOrder, exportOrders } from "./purchase-orders.controller";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get("/", getAllOrders);
purchaseOrdersRouter.get("/export", requireRole("ADMIN"), exportOrders);
purchaseOrdersRouter.get("/:id", getOrderById);
purchaseOrdersRouter.post("/", requireRole("ADMIN"), validate(createPurchaseOrderSchema), createOrder);
purchaseOrdersRouter.patch("/:id", requireRole("ADMIN"), validate(updatePurchaseOrderSchema), updateOrder);
purchaseOrdersRouter.delete("/:id", requireRole("ADMIN"), deleteOrder);
