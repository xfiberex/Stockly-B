import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { createTagSchema, updateTagSchema } from "./tags.validator";
import { tagsController } from "./tags.controller";

export const tagsRouter = Router();

tagsRouter.use(requireAuth);

tagsRouter.get("/", permitir("GET /tags"), tagsController.getAll);
tagsRouter.get("/:id", permitir("GET /tags/:id"), tagsController.getById);
tagsRouter.post("/", permitir("POST /tags"), validate(createTagSchema), tagsController.create);
tagsRouter.put("/:id", permitir("PUT /tags/:id"), validate(updateTagSchema), tagsController.update);
tagsRouter.delete("/:id", permitir("DELETE /tags/:id"), tagsController.delete);
