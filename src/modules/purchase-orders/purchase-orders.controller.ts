import { Request, Response, NextFunction } from "express";
import { purchaseOrderService } from "./purchase-orders.service";
import { reposicionService } from "./reposicion.service";
import { auditService } from "@/modules/audit-logs";
import { enviarExportacion } from "@/shared/lib/exportacion";
import type {
    CreatePurchaseOrderDto,
    GenerarDesdeSugerenciasDto,
    ReceivePurchaseOrderDto,
    UpdatePurchaseOrderDto,
} from "./purchase-orders.types";

export const purchaseOrderController = {
    async getAllOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const orders = await purchaseOrderService.getAll(
                req.query as { page?: string; limit?: string; status?: string },
            );
            res.json({ success: true, message: "Órdenes obtenidas exitosamente", data: orders });
        } catch (error) {
            next(error);
        }
    },

    async getOrderById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const order = await purchaseOrderService.getById(req.params.id);
            res.json({ success: true, message: "Orden obtenida exitosamente", data: order });
        } catch (error) {
            next(error);
        }
    },

    async createOrder(
        req: Request<{}, {}, CreatePurchaseOrderDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const order = await purchaseOrderService.create(req.body);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "CREATE", "PurchaseOrder", order.id,
            );
            res.status(201).json({ success: true, message: "Orden de compra creada exitosamente", data: order });
        } catch (error) {
            next(error);
        }
    },

    async updateOrder(
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
                { userId: req.userId, userEmail: req.userEmail },
                action, "PurchaseOrder", req.params.id,
            );
            res.json({ success: true, message: "Orden de compra actualizada", data: order });
        } catch (error) {
            next(error);
        }
    },

    /** T5-04 — una entrega parcial o la última. Se audita como recepción, con lo recibido. */
    async receiveOrder(
        req: Request<{ id: string }, {}, ReceivePurchaseOrderDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const order = await purchaseOrderService.receive(req.params.id, req.body);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "ORDER_RECEIVE", "PurchaseOrder", req.params.id,
                { status: order.status, items: req.body.items },
            );
            res.status(201).json({ success: true, message: "Recepción registrada", data: order });
        } catch (error) {
            next(error);
        }
    },

    /** T5-05 — lo que la fórmula de reposición propone pedir, paginado. */
    async getSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const sugerencias = await reposicionService.listar(req.query as { page?: string; limit?: string });
            res.json({ success: true, message: "Sugerencias de reposición obtenidas", data: sugerencias });
        } catch (error) {
            next(error);
        }
    },

    /**
     * T5-05 — una orden por proveedor con las líneas revisadas. Cada orden se audita como una
     * creación más, con su origen: en la lista de compras no se distingue de una escrita a mano,
     * y la auditoría es el sitio donde queda de dónde salió.
     */
    async generateFromSuggestions(
        req: Request<{}, {}, GenerarDesdeSugerenciasDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const orders = await reposicionService.generar(req.body);
            for (const order of orders) {
                await auditService.log(
                    { userId: req.userId, userEmail: req.userEmail },
                    "CREATE", "PurchaseOrder", order.id,
                    { origen: "REORDER_SUGGESTION", lineas: order.items.length },
                );
            }
            res.status(201).json({ success: true, message: "Órdenes de compra generadas", data: orders });
        } catch (error) {
            next(error);
        }
    },

    async deleteOrder(
        req: Request<{ id: string }>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            await purchaseOrderService.delete(req.params.id);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "DELETE", "PurchaseOrder", req.params.id,
            );
            res.json({ success: true, message: "Orden de compra eliminada" });
        } catch (error) {
            next(error);
        }
    },

    async exportOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // T2-05: el servicio entrega lotes y la respuesta se escribe según llegan.
            await enviarExportacion(res, {
                formato: req.query.format as string | undefined,
                nombreArchivo: "purchase-orders",
                mensaje: "Órdenes exportadas exitosamente",
                total: await purchaseOrderService.contarParaExportar(),
                lotes: purchaseOrderService.exportarPorLotes(),
            });
        } catch (error) {
            next(error);
        }
    },
};
