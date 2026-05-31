import { Router } from "express";
import { requireAuth } from "@/shared/middlewares/auth.middleware";
import { getSummary } from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get("/", getSummary);
