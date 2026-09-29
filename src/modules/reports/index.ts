import { Router } from "express";
import { requireAuth } from "@/shared/middlewares/auth.middleware";
import { reportsController } from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get("/", reportsController.getSummary);
reportsRouter.get("/period", reportsController.getPeriod);
reportsRouter.get("/abc", reportsController.getAbc);
