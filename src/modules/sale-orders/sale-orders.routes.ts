import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { counterSaleSchema, createSaleOrderSchema, updateSaleOrderSchema } from "./sale-orders.validator";
import { saleOrderController } from "./sale-orders.controller";

export const saleOrdersRouter = Router();

saleOrdersRouter.use(requireAuth);

saleOrdersRouter.get("/", permitir("GET /sale-orders"), saleOrderController.getAllSaleOrders);
saleOrdersRouter.get("/export", permitir("GET /sale-orders/export"), saleOrderController.exportSaleOrders);
saleOrdersRouter.get("/:id", permitir("GET /sale-orders/:id"), saleOrderController.getSaleOrderById);
// T6-07 — el comprobante de la venta, en PDF. Lo descarga quien la lee.
saleOrdersRouter.get("/:id/receipt", permitir("GET /sale-orders/:id/receipt"), saleOrderController.getSaleOrderReceipt);
saleOrdersRouter.post("/", permitir("POST /sale-orders"), validate(createSaleOrderSchema), saleOrderController.createSaleOrder);
// T6-08 — la venta de mostrador: de ADMIN y del rol de vendedor. Crea y envía en un paso, al
// precio del catálogo; la ruta de arriba, que fija precios, sigue siendo solo de ADMIN.
saleOrdersRouter.post("/counter", permitir("POST /sale-orders/counter"), validate(counterSaleSchema), saleOrderController.createCounterSale);
// T5-13 — enviar es trabajo de almacén; el `PATCH` edita la orden y la cancela, y sigue siendo de
// ADMIN. Con `status: SHIPPED` hace lo mismo que esta ruta, y se conserva para no romper a quien
// ya lo usa.
saleOrdersRouter.post("/:id/ship", permitir("POST /sale-orders/:id/ship"), saleOrderController.shipSaleOrder);
saleOrdersRouter.patch("/:id", permitir("PATCH /sale-orders/:id"), validate(updateSaleOrderSchema), saleOrderController.updateSaleOrder);
saleOrdersRouter.delete("/:id", permitir("DELETE /sale-orders/:id"), saleOrderController.deleteSaleOrder);
