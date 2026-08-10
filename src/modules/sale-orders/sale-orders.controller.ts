import { Request, Response, NextFunction } from "express";
import { saleOrderService } from "./sale-orders.service";
import { auditService } from "@/modules/audit-logs";
import { enviarExportacion } from "@/shared/lib/exportacion";
import type { CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

export async function getAllSaleOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await saleOrderService.getAll(req.query as Record<string, string>);
        res.json({ success: true, message: "Órdenes de venta obtenidas exitosamente", data: result });
    } catch (error) { next(error); }
}

export async function getSaleOrderById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
    try {
        const order = await saleOrderService.getById(req.params.id);
        res.json({ success: true, message: "Orden de venta obtenida exitosamente", data: order });
    } catch (error) { next(error); }
}

export async function createSaleOrder(
    req: Request<{}, {}, CreateSaleOrderDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const order = await saleOrderService.create(req.body);
        await auditService.log(
            { userId: req.userId, userEmail: req.userEmail },
            "CREATE", "SaleOrder", order.id,
        );
        res.status(201).json({ success: true, message: "Orden de venta creada exitosamente", data: order });
    } catch (error) { next(error); }
}

export async function updateSaleOrder(
    req: Request<{ id: string }, {}, UpdateSaleOrderDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const order = await saleOrderService.update(req.params.id, req.body);
        const action = req.body.status === "SHIPPED" ? "SALE_SHIP"
            : req.body.status === "CANCELLED" ? "SALE_CANCEL"
            : "UPDATE";
        await auditService.log(
            { userId: req.userId, userEmail: req.userEmail },
            action, "SaleOrder", req.params.id,
        );
        res.json({ success: true, message: "Orden de venta actualizada", data: order });
    } catch (error) { next(error); }
}

export async function deleteSaleOrder(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
    try {
        await saleOrderService.delete(req.params.id);
        await auditService.log(
            { userId: req.userId, userEmail: req.userEmail },
            "DELETE", "SaleOrder", req.params.id,
        );
        res.json({ success: true, message: "Orden de venta eliminada" });
    } catch (error) { next(error); }
}

export async function exportSaleOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // T2-05: el servicio entrega lotes y la respuesta se escribe según llegan.
        await enviarExportacion(res, {
            formato: req.query.format as string | undefined,
            nombreArchivo: "sale-orders",
            mensaje: "Órdenes de venta exportadas",
            total: await saleOrderService.contarParaExportar(),
            lotes: saleOrderService.exportarPorLotes(),
        });
    } catch (error) { next(error); }
}
