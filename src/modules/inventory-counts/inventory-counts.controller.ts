import { Request, Response, NextFunction } from "express";
import { inventoryCountsService } from "./inventory-counts.service";
import { auditService } from "@/modules/audit-logs";
import type { CreateInventoryCountInput, RecordInventoryCountLinesInput } from "./inventory-counts.validator";

export const inventoryCountsController = {
    async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await inventoryCountsService.getAll(req.query as Record<string, string>);
            res.json({ success: true, message: "Conteos obtenidos", data: result });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const conteo = await inventoryCountsService.getById(req.params.id);
            res.json({ success: true, message: "Conteo obtenido", data: conteo });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateInventoryCountInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const conteo = await inventoryCountsService.create(req.body, req.userEmail);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "CREATE", "InventoryCount", conteo.id,
                { lineas: conteo.summary.lines, categoria: conteo.category?.name ?? null },
            );
            res.status(201).json({ success: true, message: "Conteo abierto", data: conteo });
        } catch (error) { next(error); }
    },

    async getLines(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await inventoryCountsService.getLines(req.params.id, req.query as Record<string, string>);
            res.json({ success: true, message: "Líneas del conteo obtenidas", data: result });
        } catch (error) { next(error); }
    },

    async recordLines(
        req: Request<{ id: string }, {}, RecordInventoryCountLinesInput>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const lineas = await inventoryCountsService.recordLines(req.params.id, req.body, req.userEmail);
            res.json({ success: true, message: "Cantidades anotadas", data: lineas });
        } catch (error) { next(error); }
    },

    /** La auditoría registra el cierre con cuántos ajustes generó (criterio de T5-07). */
    async close(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const { conteo, ajustes, sinContar } = await inventoryCountsService.close(req.params.id, req.userEmail);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "COUNT_CLOSE", "InventoryCount", req.params.id,
                { ajustes, sinContar },
            );
            res.json({ success: true, message: "Conteo cerrado", data: conteo });
        } catch (error) { next(error); }
    },

    async cancel(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const conteo = await inventoryCountsService.cancel(req.params.id, req.userEmail);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "COUNT_CANCEL", "InventoryCount", req.params.id,
            );
            res.json({ success: true, message: "Conteo cancelado", data: conteo });
        } catch (error) { next(error); }
    },
};
