import { Router } from "express";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { upload, verificarFirmaDeImagen } from "@/shared/middlewares/upload.middleware";
import { settingsController } from "./settings.controller";
import { updateSettingsSchema } from "./settings.validator";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get("/", permitir("GET /settings"), settingsController.getAll);
settingsRouter.patch("/", permitir("PATCH /settings"), validate(updateSettingsSchema), settingsController.updateMany);

// T6-03 — lo único de la configuración que lee cualquier rol: quién vende y en qué moneda.
settingsRouter.get("/business", permitir("GET /settings/business"), settingsController.getBusiness);
settingsRouter.put("/logo", permitir("PUT /settings/logo"), upload.single("logo"), verificarFirmaDeImagen, settingsController.uploadLogo);
settingsRouter.delete("/logo", permitir("DELETE /settings/logo"), settingsController.deleteLogo);
