import { Router } from "express";
import { brandsController } from "@/modules/brands/brands.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { createBrandSchema, updateBrandSchema } from "@/modules/brands/brands.validator";

export const brandsRouter = Router();

brandsRouter.use(requireAuth);

brandsRouter.get("/", permitir("GET /brands"), brandsController.getAll);
brandsRouter.get("/:id", permitir("GET /brands/:id"), brandsController.getById);
brandsRouter.post("/", permitir("POST /brands"), validate(createBrandSchema), brandsController.create);
brandsRouter.put("/:id", permitir("PUT /brands/:id"), validate(updateBrandSchema), brandsController.update);
brandsRouter.delete("/:id", permitir("DELETE /brands/:id"), brandsController.delete);
