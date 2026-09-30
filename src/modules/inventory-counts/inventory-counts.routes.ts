import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { createInventoryCountSchema, recordInventoryCountLinesSchema } from "./inventory-counts.validator";
import { inventoryCountsController } from "./inventory-counts.controller";

export const inventoryCountsRouter = Router();

inventoryCountsRouter.use(requireAuth);

inventoryCountsRouter.get("/", permitir("GET /inventory-counts"), inventoryCountsController.getAll);
inventoryCountsRouter.post("/", permitir("POST /inventory-counts"), validate(createInventoryCountSchema), inventoryCountsController.create);
inventoryCountsRouter.get("/:id", permitir("GET /inventory-counts/:id"), inventoryCountsController.getById);
inventoryCountsRouter.get("/:id/lines", permitir("GET /inventory-counts/:id/lines"), inventoryCountsController.getLines);
inventoryCountsRouter.patch("/:id/lines", permitir("PATCH /inventory-counts/:id/lines"), validate(recordInventoryCountLinesSchema), inventoryCountsController.recordLines);
inventoryCountsRouter.post("/:id/close", permitir("POST /inventory-counts/:id/close"), inventoryCountsController.close);
inventoryCountsRouter.post("/:id/cancel", permitir("POST /inventory-counts/:id/cancel"), inventoryCountsController.cancel);
