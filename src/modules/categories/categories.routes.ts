import { Router } from "express";
import { categoriesController } from "@/modules/categories/categories.controller";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createCategorySchema, updateCategorySchema } from "@/modules/categories/categories.validator";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get("/", categoriesController.getAll);
categoriesRouter.get("/:id", categoriesController.getById);
categoriesRouter.post("/", requireRole("ADMIN"), validate(createCategorySchema), categoriesController.create);
categoriesRouter.put("/:id", requireRole("ADMIN"), validate(updateCategorySchema), categoriesController.update);
categoriesRouter.delete("/:id", requireRole("ADMIN"), categoriesController.delete);
