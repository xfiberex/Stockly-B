import type { Request, Response, NextFunction } from "express";
import { warehousesService } from "./warehouses.service";
import { auditService } from "@/modules/audit-logs";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "./warehouses.validator";

type ConId = Request<{ id: string }>;

export const warehousesController = {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.getAll();
            res.json({ success: true, message: "Almacenes obtenidos exitosamente", data });
        } catch (error) { next(error); }
    },

    async getResumen(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.getResumen();
            res.json({ success: true, message: "Almacenes obtenidos exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateWarehouseInput>, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.create(req.body);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "CREATE", "Warehouse", data.id, { name: data.name });
            res.status(201).json({ success: true, message: "Almacén creado exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateWarehouseInput>, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.update(req.params.id, req.body);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "UPDATE", "Warehouse", data.id, { name: data.name });
            res.json({ success: true, message: "Almacén actualizado exitosamente", data });
        } catch (error) { next(error); }
    },

    async hacerPredeterminado(req: ConId, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.hacerPredeterminado(req.params.id);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "UPDATE", "Warehouse", data.id, { name: data.name, isDefault: true });
            res.json({ success: true, message: "Almacén predeterminado cambiado", data });
        } catch (error) { next(error); }
    },

    async activar(req: ConId, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.activar(req.params.id);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "RESTORE", "Warehouse", data.id, { name: data.name });
            res.json({ success: true, message: "Almacén activado", data });
        } catch (error) { next(error); }
    },

    async desactivar(req: ConId, res: Response, next: NextFunction) {
        try {
            const data = await warehousesService.desactivar(req.params.id);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "DELETE", "Warehouse", data.id, { name: data.name });
            res.json({ success: true, message: "Almacén desactivado", data });
        } catch (error) { next(error); }
    },
};
