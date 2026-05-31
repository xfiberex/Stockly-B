import { Router } from "express";
import { suppliersController } from "@/modules/suppliers/suppliers.controller";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createSupplierSchema, updateSupplierSchema } from "@/modules/suppliers/suppliers.validator";

export const suppliersRouter = Router();

suppliersRouter.use(requireAuth);

suppliersRouter.get("/", suppliersController.getAll);
suppliersRouter.get("/:id", suppliersController.getById);
suppliersRouter.post("/", requireRole("ADMIN"), validate(createSupplierSchema), suppliersController.create);
suppliersRouter.put("/:id", requireRole("ADMIN"), validate(updateSupplierSchema), suppliersController.update);
suppliersRouter.delete("/:id", requireRole("ADMIN"), suppliersController.delete);
