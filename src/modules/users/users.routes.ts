import { Router } from "express";
import { z } from "zod";
import { validate } from "@/shared/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/shared/middlewares/auth.middleware";
import { usersController } from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", usersController.getAll);
usersRouter.get("/:id", usersController.getById);
usersRouter.patch(
    "/:id/role",
    validate(z.object({ role: z.enum(["ADMIN", "USER"]) })),
    usersController.updateRole,
);
usersRouter.patch("/:id/activate", usersController.activate);
usersRouter.patch("/:id/deactivate", usersController.deactivate);
