import type { Request, Response, NextFunction } from "express";
import { auditService } from "./audit-logs.service";

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await auditService.getAll(req.query as Record<string, string>);
        res.json({ success: true, message: "Registros de auditoría obtenidos", data: result });
    } catch (error) {
        next(error);
    }
}
