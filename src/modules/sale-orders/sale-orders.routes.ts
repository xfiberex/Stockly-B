import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { createSaleOrderSchema, updateSaleOrderSchema } from "./sale-orders.validator";
import { saleOrderController } from "./sale-orders.controller";

export const saleOrdersRouter = Router();

saleOrdersRouter.use(requireAuth);

saleOrdersRouter.get("/", permitir("GET /sale-orders"), saleOrderController.getAllSaleOrders);
saleOrdersRouter.get("/export", permitir("GET /sale-orders/export"), saleOrderController.exportSaleOrders);
saleOrdersRouter.get("/:id", permitir("GET /sale-orders/:id"), saleOrderController.getSaleOrderById);
saleOrdersRouter.post("/", permitir("POST /sale-orders"), validate(createSaleOrderSchema), saleOrderController.createSaleOrder);
// T5-13 — enviar es trabajo de almacén; el `PATCH` edita la orden y la cancela, y sigue siendo de
// ADMIN. Con `status: SHIPPED` hace lo mismo que esta ruta, y se conserva para no romper a quien
// ya lo usa.
saleOrdersRouter.post("/:id/ship", permitir("POST /sale-orders/:id/ship"), saleOrderController.shipSaleOrder);
saleOrdersRouter.patch("/:id", permitir("PATCH /sale-orders/:id"), validate(updateSaleOrderSchema), saleOrderController.updateSaleOrder);
saleOrdersRouter.delete("/:id", permitir("DELETE /sale-orders/:id"), saleOrderController.deleteSaleOrder);
