import type { Request, Response, NextFunction } from "express";
import { stockTransfersService } from "./stock-transfers.service";
import { auditService } from "@/modules/audit-logs";
import type { CreateStockTransferInput } from "./stock-transfers.validator";

export const stockTransfersController = {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await stockTransfersService.getAll(req.query as Record<string, string>);
            res.json({ success: true, message: "Transferencias obtenidas", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await stockTransfersService.getById(req.params.id);
            res.json({ success: true, message: "Transferencia obtenida", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateStockTransferInput>, res: Response, next: NextFunction) {
        try {
            const data = await stockTransfersService.create(req.body, req.userEmail);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "STOCK_TRANSFER", "StockTransfer", data.id,
                { origen: data.fromWarehouse.name, destino: data.toWarehouse.name, lineas: data.lines, unidades: data.units },
            );
            res.status(201).json({ success: true, message: "Transferencia registrada", data });
        } catch (error) { next(error); }
    },
};
