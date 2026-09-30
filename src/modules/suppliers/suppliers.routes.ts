import { Router } from "express";
import { suppliersController } from "@/modules/suppliers/suppliers.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createSupplierSchema, updateSupplierSchema } from "@/modules/suppliers/suppliers.validator";

export const suppliersRouter = Router();

suppliersRouter.use(requireAuth);

suppliersRouter.get("/", permitir("GET /suppliers"), suppliersController.getAll);
suppliersRouter.get("/:id", permitir("GET /suppliers/:id"), suppliersController.getById);
suppliersRouter.post("/", permitir("POST /suppliers"), validate(createSupplierSchema), suppliersController.create);
suppliersRouter.put("/:id", permitir("PUT /suppliers/:id"), validate(updateSupplierSchema), suppliersController.update);
suppliersRouter.delete("/:id", permitir("DELETE /suppliers/:id"), suppliersController.delete);
