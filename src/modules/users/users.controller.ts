import type { Request, Response, NextFunction } from "express";
import { usersService } from "./users.service";
import type { $Enums } from "@/generated/prisma/client";

export const usersController = {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await usersService.getAll(req.query as Record<string, string>);
            res.json({ success: true, message: "Usuarios obtenidos exitosamente", data: result });
        } catch (error) { next(error); }
    },

    async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const user = await usersService.getById(req.params.id);
            res.json({ success: true, message: "Usuario obtenido exitosamente", data: user });
        } catch (error) { next(error); }
    },

    async updateRole(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            // El `z.enum(["ADMIN", "USER"])` de la ruta ya lo garantiza; el cast solo
            // traslada esa garantía al tipo, que desde T3-02 es el enum de Prisma.
            const { role } = req.body as { role: $Enums.Role };
            const user = await usersService.updateRole(req.params.id, role, req.userId!);
            res.json({ success: true, message: "Rol actualizado exitosamente", data: user });
        } catch (error) { next(error); }
    },

    async activate(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const user = await usersService.setActive(req.params.id, true, req.userId!);
            res.json({ success: true, message: "Usuario activado exitosamente", data: user });
        } catch (error) { next(error); }
    },

    async deactivate(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const user = await usersService.setActive(req.params.id, false, req.userId!);
            res.json({ success: true, message: "Usuario desactivado exitosamente", data: user });
        } catch (error) { next(error); }
    },
};
