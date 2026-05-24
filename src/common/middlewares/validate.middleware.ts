import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

// Middleware para validar las solicitudes usando express-validator
export function validateRequest(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        res.status(422).json({
            success: false,
            message: "Error de validación",
            errors: errors.array().map((err) => ({
                field: err.type === "field" ? err.path : err.type,
                message: err.msg,
            })),
        });
        return;
    }
    
    next();
}
