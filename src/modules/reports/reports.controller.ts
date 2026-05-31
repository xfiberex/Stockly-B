import { Request, Response, NextFunction } from "express";
import { reportsService } from "./reports.service";

export async function getSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const summary = await reportsService.getSummary();
        res.json({ success: true, message: "Reporte generado exitosamente", data: summary });
    } catch (error) {
        next(error);
    }
}
