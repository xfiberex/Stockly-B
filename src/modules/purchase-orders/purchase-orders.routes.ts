import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import {
    createPurchaseOrderSchema,
    generarDesdeSugerenciasSchema,
    receivePurchaseOrderSchema,
    updatePurchaseOrderSchema,
} from "./purchase-orders.validator";
import { purchaseOrderController } from "./purchase-orders.controller";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get("/", permitir("GET /purchase-orders"), purchaseOrderController.getAllOrders);
purchaseOrdersRouter.get("/export", permitir("GET /purchase-orders/export"), purchaseOrderController.exportOrders);
// T5-05 — antes de `/:id`, o Express tomaría «suggestions» por el id de una orden.
purchaseOrdersRouter.get("/suggestions", permitir("GET /purchase-orders/suggestions"), purchaseOrderController.getSuggestions);
purchaseOrdersRouter.post("/suggestions", permitir("POST /purchase-orders/suggestions"), validate(generarDesdeSugerenciasSchema), purchaseOrderController.generateFromSuggestions);
purchaseOrdersRouter.get("/:id", permitir("GET /purchase-orders/:id"), purchaseOrderController.getOrderById);
purchaseOrdersRouter.post("/", permitir("POST /purchase-orders"), validate(createPurchaseOrderSchema), purchaseOrderController.createOrder);
purchaseOrdersRouter.post("/:id/receipts", permitir("POST /purchase-orders/:id/receipts"), validate(receivePurchaseOrderSchema), purchaseOrderController.receiveOrder);
purchaseOrdersRouter.patch("/:id", permitir("PATCH /purchase-orders/:id"), validate(updatePurchaseOrderSchema), purchaseOrderController.updateOrder);
purchaseOrdersRouter.delete("/:id", permitir("DELETE /purchase-orders/:id"), purchaseOrderController.deleteOrder);
