import { Router } from "express";
import { warehousesController } from "./warehouses.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createWarehouseSchema, updateWarehouseSchema } from "./warehouses.validator";

export const warehousesRouter = Router();

warehousesRouter.use(requireAuth);

warehousesRouter.get("/", permitir("GET /warehouses"), warehousesController.getAll);
warehousesRouter.get("/summary", permitir("GET /warehouses/summary"), warehousesController.getResumen);
warehousesRouter.post("/", permitir("POST /warehouses"), validate(createWarehouseSchema), warehousesController.create);
warehousesRouter.put("/:id", permitir("PUT /warehouses/:id"), validate(updateWarehouseSchema), warehousesController.update);
warehousesRouter.patch("/:id/default", permitir("PATCH /warehouses/:id/default"), warehousesController.hacerPredeterminado);
warehousesRouter.patch("/:id/activate", permitir("PATCH /warehouses/:id/activate"), warehousesController.activar);
warehousesRouter.patch("/:id/deactivate", permitir("PATCH /warehouses/:id/deactivate"), warehousesController.desactivar);
