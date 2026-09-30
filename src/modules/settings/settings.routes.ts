import { Router } from "express";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { settingsController } from "./settings.controller";
import { updateSettingsSchema } from "./settings.validator";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get("/", permitir("GET /settings"), settingsController.getAll);
settingsRouter.patch("/", permitir("PATCH /settings"), validate(updateSettingsSchema), settingsController.updateMany);
