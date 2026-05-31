import { Request, Response, NextFunction } from "express";
import { purchaseOrderService } from "./purchase-orders.service";
import type { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from "./purchase-orders.types";

export async function getAllOrders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const orders = await purchaseOrderService.getAll();
        res.json({ success: true, message: "Órdenes obtenidas exitosamente", data: orders });
    } catch (error) {
        next(error);
    }
}

export async function getOrderById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
    try {
        const order = await purchaseOrderService.getById(req.params.id);
        res.json({ success: true, message: "Orden obtenida exitosamente", data: order });
    } catch (error) {
        next(error);
    }
}

export async function createOrder(
    req: Request<{}, {}, CreatePurchaseOrderDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const order = await purchaseOrderService.create(req.body);
        res.status(201).json({ success: true, message: "Orden de compra creada exitosamente", data: order });
    } catch (error) {
        next(error);
    }
}

export async function updateOrder(
    req: Request<{ id: string }, {}, UpdatePurchaseOrderDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const order = await purchaseOrderService.update(req.params.id, req.body);
        res.json({ success: true, message: "Orden de compra actualizada", data: order });
    } catch (error) {
        next(error);
    }
}

export async function deleteOrder(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        await purchaseOrderService.delete(req.params.id);
        res.json({ success: true, message: "Orden de compra eliminada" });
    } catch (error) {
        next(error);
    }
}
