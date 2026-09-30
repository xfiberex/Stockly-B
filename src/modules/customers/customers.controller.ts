import type { Request, Response, NextFunction } from "express";
import { customersService } from "@/modules/customers/customers.service";
import { auditService } from "@/modules/audit-logs";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/modules/customers/customers.validator";

// T5-06 — el alta, la edición y el borrado quedan en la auditoría, como las órdenes: son datos
// personales, y quién los tocó es lo primero que se pregunta. Sin `details`: copiar el nombre o
// el correo al registro sería guardarlos en un segundo sitio del que nadie los borra.

export const customersController = {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await customersService.getAll(req.query as Record<string, unknown>);
            res.json({ success: true, message: "Clientes obtenidos exitosamente", data });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await customersService.getById(req.params.id);
            res.json({ success: true, message: "Cliente obtenido exitosamente", data });
        } catch (error) { next(error); }
    },

    async create(req: Request<{}, {}, CreateCustomerInput>, res: Response, next: NextFunction) {
        try {
            const data = await customersService.create(req.body);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "CREATE", "Customer", data.id);
            res.status(201).json({ success: true, message: "Cliente creado exitosamente", data });
        } catch (error) { next(error); }
    },

    async update(req: Request<{ id: string }, {}, UpdateCustomerInput>, res: Response, next: NextFunction) {
        try {
            const data = await customersService.update(req.params.id, req.body);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "UPDATE", "Customer", req.params.id);
            res.json({ success: true, message: "Cliente actualizado exitosamente", data });
        } catch (error) { next(error); }
    },

    async delete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            await customersService.delete(req.params.id);
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "DELETE", "Customer", req.params.id);
            res.json({ success: true, message: "Cliente eliminado correctamente" });
        } catch (error) { next(error); }
    },
};
