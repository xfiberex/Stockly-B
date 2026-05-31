import { Router } from "express";
import { brandsController } from "@/modules/brands/brands.controller";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createBrandSchema, updateBrandSchema } from "@/modules/brands/brands.validator";

export const brandsRouter = Router();

brandsRouter.use(requireAuth);

brandsRouter.get("/", brandsController.getAll);
brandsRouter.get("/:id", brandsController.getById);
brandsRouter.post("/", requireRole("ADMIN"), validate(createBrandSchema), brandsController.create);
brandsRouter.put("/:id", requireRole("ADMIN"), validate(updateBrandSchema), brandsController.update);
brandsRouter.delete("/:id", requireRole("ADMIN"), brandsController.delete);
