import type { Request, Response, NextFunction } from "express";
import { brandsService } from "@/modules/brands/brands.service";
import type { CreateBrandInput, UpdateBrandInput } from "@/modules/brands/brands.validator";

export const brandsController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await brandsService.getAll();
            res.json({ success: true, message: "Marcas obtenidas exitosamente", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await brandsService.getById(req.params.id);
            res.json({ success: true, message: "Marca obtenida exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateBrandInput>, res: Response, next: NextFunction) {
        try {
            const data = await brandsService.create(req.body);
            res.status(201).json({ success: true, message: "Marca creada exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateBrandInput>, res: Response, next: NextFunction) {
        try {
            const data = await brandsService.update(req.params.id, req.body);
            res.json({ success: true, message: "Marca actualizada exitosamente", data });
        } catch (error) { next(error); }
    },

    async delete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            await brandsService.delete(req.params.id);
            res.json({ success: true, message: "Marca eliminada correctamente" });
        } catch (error) { next(error); }
    },
};
