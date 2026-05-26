import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../shared/lib/httpError";

// Middleware de manejo de errores
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: env.nodeEnv === "production"
      ? "Error interno del servidor"
      : err.message,
  });
}