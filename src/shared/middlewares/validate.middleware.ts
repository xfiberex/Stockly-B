import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Middleware factory para validar req.body con un schema de Zod
export function validate(schema: z.ZodTypeAny) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            res.status(422).json({
                success: false,
                message: "Error de validación",
                errors: result.error.issues.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            });
            return;
        }

        // Reemplaza req.body con los datos parseados y coercionados por Zod
        req.body = result.data;
        next();
    };
}
