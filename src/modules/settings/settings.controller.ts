import type { Request, Response, NextFunction } from "express";
import { HttpError } from "@/shared/lib/httpError";
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

    /** T6-03 — los datos del negocio y su moneda, para cualquier rol. */
    async getBusiness(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await settingsService.negocio();
            res.json({ success: true, message: "Datos del negocio obtenidos", data });
        } catch (error) { next(error); }
    },

    async uploadLogo(req: Request, res: Response, next: NextFunction) {
        try {
            // `verificarFirmaDeImagen` deja pasar una petición sin archivo, porque en un
            // producto la imagen es opcional. Aquí el archivo es la petición entera.
            if (!req.file) throw new HttpError(422, "Falta la imagen del logo, en el campo «logo»", "IMAGE_REQUIRED");
            const data = await settingsService.guardarLogo(req.file.buffer);
            res.json({ success: true, message: "Logo del negocio actualizado", data });
        } catch (error) { next(error); }
    },

    async deleteLogo(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await settingsService.quitarLogo();
            res.json({ success: true, message: "Logo del negocio eliminado", data });
        } catch (error) { next(error); }
    },
};
