import { Router } from "express";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { auditLogsController } from "./audit-logs.controller";

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth, requireRole("ADMIN"));
auditLogsRouter.get("/", auditLogsController.getAuditLogs);
