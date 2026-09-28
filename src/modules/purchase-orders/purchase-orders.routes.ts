import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import {
    createPurchaseOrderSchema,
    generarDesdeSugerenciasSchema,
    receivePurchaseOrderSchema,
    updatePurchaseOrderSchema,
} from "./purchase-orders.validator";
import { purchaseOrderController } from "./purchase-orders.controller";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get("/", purchaseOrderController.getAllOrders);
purchaseOrdersRouter.get("/export", requireRole("ADMIN"), purchaseOrderController.exportOrders);
// T5-05 — antes de `/:id`, o Express tomaría «suggestions» por el id de una orden.
purchaseOrdersRouter.get("/suggestions", purchaseOrderController.getSuggestions);
purchaseOrdersRouter.post("/suggestions", requireRole("ADMIN"), validate(generarDesdeSugerenciasSchema), purchaseOrderController.generateFromSuggestions);
purchaseOrdersRouter.get("/:id", purchaseOrderController.getOrderById);
purchaseOrdersRouter.post("/", requireRole("ADMIN"), validate(createPurchaseOrderSchema), purchaseOrderController.createOrder);
purchaseOrdersRouter.post("/:id/receipts", requireRole("ADMIN"), validate(receivePurchaseOrderSchema), purchaseOrderController.receiveOrder);
purchaseOrdersRouter.patch("/:id", requireRole("ADMIN"), validate(updatePurchaseOrderSchema), purchaseOrderController.updateOrder);
purchaseOrdersRouter.delete("/:id", requireRole("ADMIN"), purchaseOrderController.deleteOrder);
