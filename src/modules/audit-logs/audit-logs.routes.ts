import { Router } from "express";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { auditLogsController } from "./audit-logs.controller";

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth);
auditLogsRouter.get("/", permitir("GET /audit-logs"), auditLogsController.getAuditLogs);
// AUD-017
auditLogsRouter.get("/actors", permitir("GET /audit-logs/actors"), auditLogsController.getActors);
auditLogsRouter.get("/export", permitir("GET /audit-logs/export"), auditLogsController.exportAuditLogs);
