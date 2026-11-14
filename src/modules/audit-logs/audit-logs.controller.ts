import type { Request, Response, NextFunction } from "express";
import { enviarExportacion } from "@/shared/lib/exportacion";
import { auditService, type ConsultaDeAuditoria } from "./audit-logs.service";

export const auditLogsController = {
    async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await auditService.getAll(req.query as ConsultaDeAuditoria);
            res.json({ success: true, message: "Registros de auditoría obtenidos", data: result });
        } catch (error) {
            next(error);
        }
    },

    /** AUD-017 — quién aparece en la bitácora, para filtrar por usuario. */
    async getActors(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            res.json({ success: true, message: "Usuarios de la auditoría obtenidos", data: await auditService.actores() });
        } catch (error) {
            next(error);
        }
    },

    /** AUD-017 — la bitácora filtrada, por lotes, en CSV o JSON. */
    async exportAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const query = req.query as ConsultaDeAuditoria;
            await enviarExportacion(res, {
                formato: req.query.format as string | undefined,
                nombreArchivo: "audit-logs",
                mensaje: "Registros de auditoría exportados",
                total: await auditService.contarParaExportar(query),
                lotes: auditService.exportarPorLotes(query),
            });
        } catch (error) {
            next(error);
        }
    },
};
