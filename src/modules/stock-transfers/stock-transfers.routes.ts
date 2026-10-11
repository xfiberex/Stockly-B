import { Router } from "express";
import { stockTransfersController } from "./stock-transfers.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createStockTransferSchema } from "./stock-transfers.validator";

export const stockTransfersRouter = Router();

stockTransfersRouter.use(requireAuth);

stockTransfersRouter.get("/", permitir("GET /stock-transfers"), stockTransfersController.getAll);
stockTransfersRouter.get("/:id", permitir("GET /stock-transfers/:id"), stockTransfersController.getById);
stockTransfersRouter.post("/", permitir("POST /stock-transfers"), validate(createStockTransferSchema), stockTransfersController.create);
