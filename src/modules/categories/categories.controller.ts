import type { Request, Response, NextFunction } from "express";
import { categoriesService } from "@/modules/categories/categories.service";
import type { CreateCategoryInput, UpdateCategoryInput } from "@/modules/categories/categories.validator";

export const categoriesController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await categoriesService.getAll();
            res.json({ success: true, message: "Categorías obtenidas exitosamente", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await categoriesService.getById(req.params.id);
            res.json({ success: true, message: "Categoría obtenida exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateCategoryInput>, res: Response, next: NextFunction) {
        try {
            const data = await categoriesService.create(req.body);
            res.status(201).json({ success: true, message: "Categoría creada exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateCategoryInput>, res: Response, next: NextFunction) {
        try {
            const data = await categoriesService.update(req.params.id, req.body);
            res.json({ success: true, message: "Categoría actualizada exitosamente", data });
        } catch (error) { next(error); }
    },

    async delete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            await categoriesService.delete(req.params.id);
            res.json({ success: true, message: "Categoría eliminada correctamente" });
        } catch (error) { next(error); }
    },
};
