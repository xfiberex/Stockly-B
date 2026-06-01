import { Request, Response, NextFunction } from "express";
import { purchaseOrderService } from "./purchase-orders.service";
import { auditService } from "@/modules/audit-logs";
import { buildCsv } from "@/shared/lib/csv";
import type { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from "./purchase-orders.types";

async function getActorEmail(userId: string): Promise<string | undefined> {
    try {
        const { prisma } = await import("@/shared/lib/prisma");
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        return user?.email;
    } catch { return undefined; }
}

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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "CREATE", "PurchaseOrder", order.id,
        );
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
        const action = req.body.status === "RECEIVED" ? "ORDER_RECEIVE"
            : req.body.status === "CANCELLED" ? "ORDER_CANCEL"
            : "UPDATE";
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            action, "PurchaseOrder", req.params.id,
        );
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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "DELETE", "PurchaseOrder", req.params.id,
        );
        res.json({ success: true, message: "Orden de compra eliminada" });
    } catch (error) {
        next(error);
    }
}

export async function exportOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const rows = await purchaseOrderService.exportAll();
        const format = (req.query.format as string | undefined) ?? "json";

        if (format === "csv") {
            const csv = buildCsv(rows);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=purchase-orders.csv");
            res.send(csv);
            return;
        }

        res.json({ success: true, message: "Órdenes exportadas exitosamente", data: rows });
    } catch (error) {
        next(error);
    }
}
