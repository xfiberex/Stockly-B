import type { Request, Response, NextFunction } from "express";
import { suppliersService } from "@/modules/suppliers/suppliers.service";
import type { CreateSupplierInput, UpdateSupplierInput } from "@/modules/suppliers/suppliers.validator";

export const suppliersController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await suppliersService.getAll();
            res.json({ success: true, message: "Proveedores obtenidos exitosamente", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await suppliersService.getById(req.params.id);
            res.json({ success: true, message: "Proveedor obtenido exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateSupplierInput>, res: Response, next: NextFunction) {
        try {
            const data = await suppliersService.create(req.body);
            res.status(201).json({ success: true, message: "Proveedor creado exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateSupplierInput>, res: Response, next: NextFunction) {
        try {
            const data = await suppliersService.update(req.params.id, req.body);
            res.json({ success: true, message: "Proveedor actualizado exitosamente", data });
        } catch (error) { next(error); }
    },

    async delete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            await suppliersService.delete(req.params.id);
            res.json({ success: true, message: "Proveedor eliminado correctamente" });
        } catch (error) { next(error); }
    },
};
