import type { Request, Response, NextFunction } from "express";
import { settingsService } from "./settings.service";

export const settingsController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await settingsService.getAll();
            res.json({ success: true, message: "Configuración obtenida exitosamente", data });
        } catch (error) { next(error); }
    },

    async updateMany(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await settingsService.updateMany(req.body as Record<string, boolean | string | number>);
            res.json({ success: true, message: "Configuración actualizada exitosamente", data });
        } catch (error) { next(error); }
    },
};
