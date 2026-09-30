import { Router } from "express";
import { customersController } from "@/modules/customers/customers.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createCustomerSchema, updateCustomerSchema } from "@/modules/customers/customers.validator";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", permitir("GET /customers"), customersController.getAll);
customersRouter.get("/:id", permitir("GET /customers/:id"), customersController.getById);
customersRouter.post("/", permitir("POST /customers"), validate(createCustomerSchema), customersController.create);
customersRouter.put("/:id", permitir("PUT /customers/:id"), validate(updateCustomerSchema), customersController.update);
customersRouter.delete("/:id", permitir("DELETE /customers/:id"), customersController.delete);
