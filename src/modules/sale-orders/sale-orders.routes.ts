import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createSaleOrderSchema, updateSaleOrderSchema } from "./sale-orders.validator";
import {
    getAllSaleOrders,
    getSaleOrderById,
    createSaleOrder,
    updateSaleOrder,
    deleteSaleOrder,
    exportSaleOrders,
} from "./sale-orders.controller";

export const saleOrdersRouter = Router();

saleOrdersRouter.use(requireAuth);

saleOrdersRouter.get("/", getAllSaleOrders);
saleOrdersRouter.get("/export", requireRole("ADMIN"), exportSaleOrders);
saleOrdersRouter.get("/:id", getSaleOrderById);
saleOrdersRouter.post("/", requireRole("ADMIN"), validate(createSaleOrderSchema), createSaleOrder);
saleOrdersRouter.patch("/:id", requireRole("ADMIN"), validate(updateSaleOrderSchema), updateSaleOrder);
saleOrdersRouter.delete("/:id", requireRole("ADMIN"), deleteSaleOrder);
