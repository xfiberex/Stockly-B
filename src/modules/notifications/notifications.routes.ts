import { Router } from "express";
import { notificationsController } from "@/modules/notifications/notifications.controller";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { crearLimitadorDeSondeo } from "@/shared/middlewares/rateLimiter.middleware";
import { env } from "@/config/env";

export const notificationsRouter = Router();

// Antes que `requireAuth`: una petición sin sesión también gasta cupo, o el tope no protegería
// de quien martillea sin haber entrado.
// `use` y no `get`: una segunda ruta con este camino sería, para `permisos.test.ts`, una ruta sin fila.
notificationsRouter.use("/unread-count", crearLimitadorDeSondeo(env.rateLimitMax));

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", permitir("GET /notifications"), notificationsController.getAll);
notificationsRouter.get("/unread-count", permitir("GET /notifications/unread-count"), notificationsController.unreadCount);
// Antes que `/:id/read`: no chocan —una tiene un segmento y la otra dos—, pero así se lee igual.
notificationsRouter.post("/read-all", permitir("POST /notifications/read-all"), notificationsController.markAllRead);
notificationsRouter.post("/:id/read", permitir("POST /notifications/:id/read"), notificationsController.markRead);
