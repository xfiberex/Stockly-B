import rateLimit from "express-rate-limit";

const json429 = (_req: unknown, res: { status: (c: number) => { json: (b: object) => void } }) =>
    res.status(429).json({ success: false, message: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." });

// 10 intentos / 15 min — login y forgot-password
export const authStrictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: json429,
});

// 5 intentos / hora — register y resend-verification
export const authRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: json429,
});
