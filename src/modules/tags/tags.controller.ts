import type { Request, Response, NextFunction } from "express";
import { tagsService } from "./tags.service";
import type { CreateTagInput, UpdateTagInput } from "./tags.validator";

export const tagsController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await tagsService.getAll();
            res.json({ success: true, message: "Etiquetas obtenidas exitosamente", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await tagsService.getById(req.params.id);
            res.json({ success: true, message: "Etiqueta obtenida exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateTagInput>, res: Response, next: NextFunction) {
        try {
            const data = await tagsService.create(req.body);
            res.status(201).json({ success: true, message: "Etiqueta creada exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateTagInput>, res: Response, next: NextFunction) {
        try {
            const data = await tagsService.update(req.params.id, req.body);
            res.json({ success: true, message: "Etiqueta actualizada exitosamente", data });
        } catch (error) { next(error); }
    },

    async delete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            await tagsService.delete(req.params.id);
            res.json({ success: true, message: "Etiqueta eliminada correctamente" });
        } catch (error) { next(error); }
    },
};
