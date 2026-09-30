import { Router } from "express";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { auditLogsController } from "./audit-logs.controller";

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth);
auditLogsRouter.get("/", permitir("GET /audit-logs"), auditLogsController.getAuditLogs);
