import type { Request, Response, NextFunction } from "express";
import { usersService } from "./users.service";
import type { RolAsignable } from "@/contratos/api";
import { auditService } from "@/modules/audit-logs";
import { idiomaDePeticion } from "@/shared/lib/idiomaDePeticion";

export const usersController = {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await usersService.getAll(req.query as Record<string, string>);
            res.json({ success: true, message: "Usuarios obtenidos exitosamente", data: result });
        } catch (error) { next(error); }
    },

    async invite(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, email, role } = req.body as { name: string; email: string; role: RolAsignable };
            // De la persona invitada no se conoce ningún idioma: va el de quien la invita, y se
            // corrige solo en su primer inicio de sesión (T4-12).
            const user = await usersService.invite({ name, email, role }, idiomaDePeticion(req));
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "CREATE", "User", user.id, { email: user.email, role: user.role });
            res.status(201).json({ success: true, message: "Invitación enviada", data: user });
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
            // El `rolAsignableSchema` de la ruta ya lo garantiza; el cast solo traslada esa
            // garantía al tipo.
            const { role } = req.body as { role: RolAsignable };
            const { user, rolAnterior, aprobada } = await usersService.updateRole(req.params.id, role, req.userId!);
            // AUD-001 — cambiar un rol cambia permisos, y no dejaba rastro aunque
            // `USER_ROLE_CHANGE` existía desde T3-02. Una aprobación es el mismo cambio, desde
            // `PENDING`, y lo dice.
            await auditService.log({ userId: req.userId, userEmail: req.userEmail }, "USER_ROLE_CHANGE", "User", user.id, {
                email: user.email,
                de: rolAnterior,
                a: role,
                ...(aprobada && { aprobada: true }),
            });
            res.json({ success: true, message: aprobada ? "Cuenta aprobada" : "Rol actualizado exitosamente", data: user });
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
