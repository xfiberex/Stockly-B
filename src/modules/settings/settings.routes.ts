import { Router } from "express";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { settingsController } from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole("ADMIN"));

settingsRouter.get("/", settingsController.getAll);
settingsRouter.patch("/", settingsController.updateMany);
