import type { Request, Response, NextFunction } from "express";
import { notificationsService } from "@/modules/notifications/notifications.service";

// T5-12 — todo va por `req.userId`: no hay parámetro con el que pedir los avisos de otro.
// `requireAuth` garantiza que existe; el `!` solo se lo cuenta a TypeScript.

export const notificationsController = {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await notificationsService.getAll(req.userId!);
            res.json({ success: true, message: "Avisos obtenidos exitosamente", data });
        } catch (error) { next(error); }
    },

    /** La consulta periódica de la campana. De paso hace el mantenimiento, si toca. */
    async unreadCount(req: Request, res: Response, next: NextFunction) {
        try {
            await notificationsService.mantenerSiToca();
            const data = await notificationsService.unreadCount(req.userId!);
            res.json({ success: true, message: "Avisos sin leer", data });
        } catch (error) { next(error); }
    },

    async markRead(req: Request<{ id: string }>, res: Response, next: NextFunction) {
        try {
            const data = await notificationsService.markRead(req.userId!, req.params.id);
            res.json({ success: true, message: "Aviso marcado como leído", data });
        } catch (error) { next(error); }
    },

    async markAllRead(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await notificationsService.markAllRead(req.userId!);
            res.json({ success: true, message: "Avisos marcados como leídos", data });
        } catch (error) { next(error); }
    },
};
