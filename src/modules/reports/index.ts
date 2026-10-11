import { Router } from "express";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { reportsController } from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get("/", permitir("GET /reports"), reportsController.getSummary);
reportsRouter.get("/period", permitir("GET /reports/period"), reportsController.getPeriod);
reportsRouter.get("/abc", permitir("GET /reports/abc"), reportsController.getAbc);
reportsRouter.get("/expiring", permitir("GET /reports/expiring"), reportsController.getExpiring);
