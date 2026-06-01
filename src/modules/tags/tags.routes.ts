import { Router } from "express";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { createTagSchema, updateTagSchema } from "./tags.validator";
import { tagsController } from "./tags.controller";

export const tagsRouter = Router();

tagsRouter.use(requireAuth);

tagsRouter.get("/", tagsController.getAll);
tagsRouter.get("/:id", tagsController.getById);
tagsRouter.post("/", requireRole("ADMIN"), validate(createTagSchema), tagsController.create);
tagsRouter.put("/:id", requireRole("ADMIN"), validate(updateTagSchema), tagsController.update);
tagsRouter.delete("/:id", requireRole("ADMIN"), tagsController.delete);
