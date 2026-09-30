import { Router } from "express";
import { categoriesController } from "@/modules/categories/categories.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createCategorySchema, updateCategorySchema } from "@/modules/categories/categories.validator";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get("/", permitir("GET /categories"), categoriesController.getAll);
categoriesRouter.get("/:id", permitir("GET /categories/:id"), categoriesController.getById);
categoriesRouter.post("/", permitir("POST /categories"), validate(createCategorySchema), categoriesController.create);
categoriesRouter.put("/:id", permitir("PUT /categories/:id"), validate(updateCategorySchema), categoriesController.update);
categoriesRouter.delete("/:id", permitir("DELETE /categories/:id"), categoriesController.delete);
