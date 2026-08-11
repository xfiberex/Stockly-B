import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { CodigoDeError } from "@/contratos/api";

export function validate(schema: z.ZodTypeAny) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            res.status(422).json({
                success: false,
                message: "Error de validación",
                // T4-04 — el código es lo que el cliente puede traducir; el `message` de
                // arriba se queda como estaba, que es lo que ve quien llama a la API sin
                // interfaz. Los mensajes por campo siguen siendo los del validador: ver
                // `VALIDATION_ERROR` en el contrato, donde está el porqué.
                code: "VALIDATION_ERROR" satisfies CodigoDeError,
                errors: result.error.issues.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            });
            return;
        }

        req.body = result.data;
        next();
    };
}
