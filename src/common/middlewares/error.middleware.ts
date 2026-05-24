import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

// Middleware de manejo de errores
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);

  res.status(500).json({
    success: false,
    message: env.nodeEnv === "production"
      ? "Error interno del servidor"
      : err.message,
  });
}