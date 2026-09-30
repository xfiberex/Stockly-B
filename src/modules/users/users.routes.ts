import { Router } from "express";
import { z } from "zod";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, permitir } from "@/shared/middlewares/auth.middleware";
import { rolSchema } from "@/contratos/api";
import { usersController } from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", permitir("GET /users"), usersController.getAll);
usersRouter.get("/:id", permitir("GET /users/:id"), usersController.getById);
usersRouter.patch(
    "/:id/role",
    permitir("PATCH /users/:id/role"),
    // T5-13 — los roles salen del contrato, que vigila un test contra el enum de la base: con
    // la lista escrita aquí, `WAREHOUSE` existía y no se podía asignar.
    validate(z.object({ role: rolSchema })),
    usersController.updateRole,
);
usersRouter.patch("/:id/activate", permitir("PATCH /users/:id/activate"), usersController.activate);
usersRouter.patch("/:id/deactivate", permitir("PATCH /users/:id/deactivate"), usersController.deactivate);
