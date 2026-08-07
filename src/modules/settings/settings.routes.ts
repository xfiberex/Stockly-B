import { Router } from "express";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { settingsController } from "./settings.controller";
import { updateSettingsSchema } from "./settings.validator";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole("ADMIN"));

settingsRouter.get("/", settingsController.getAll);
settingsRouter.patch("/", validate(updateSettingsSchema), settingsController.updateMany);
