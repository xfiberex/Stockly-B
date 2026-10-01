import rateLimit from "express-rate-limit";

const json429 = (_req: unknown, res: { status: (c: number) => { json: (b: object) => void } }) =>
    res.status(429).json({
        success: false,
        message: "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
        code: "RATE_LIMITED",
    });

const QUINCE_MINUTOS = 15 * 60 * 1000;

/**
 * T5-12 — la consulta periódica de la campana, tal como llega a `app` (con su prefijo).
 *
 * Tiene **su propio cupo**, aparte del global. Una pestaña abierta pregunta una vez por minuto:
 * quince peticiones cada quince minutos que nadie ha pedido. Contadas en el límite global —100
 * por IP— tres pestañas se comían casi la mitad, y quien acababa viendo el 429 era la persona
 * que estaba trabajando, no la campana. Con cupos separados, lo peor que le pasa al sondeo es
 * quedarse sin el suyo: la campana conserva el último número y la aplicación sigue respondiendo.
 *
 * No queda sin límite: sigue siendo una ruta que consulta la base, y sin tope sería la única
 * por la que se podría martillear.
 */
export const RUTA_DEL_SONDEO = "/api/v1/notifications/unread-count";

/** El límite global: todo menos el sondeo, que lleva el suyo. */
export const crearLimitadorGlobal = (max: number) =>
    rateLimit({
        windowMs: QUINCE_MINUTOS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
        skip: (req) => req.path === RUTA_DEL_SONDEO,
    });

/** El del sondeo: el mismo techo que el global —se configura con la misma variable—, en otro cubo. */
export const crearLimitadorDeSondeo = (max: number) =>
    rateLimit({
        windowMs: QUINCE_MINUTOS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: json429,
        skip: () => process.env.NODE_ENV === "test",
    });

// Igual que el límite global: el E2E hace un login por prueba y se pasaba de 10.
const authMax = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "", 10) || 10;

// 10 intentos / 15 min — login y forgot-password
export const authStrictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: authMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: json429,
    skip: () => process.env.NODE_ENV === "test",
});

// 5 intentos / hora — register y resend-verification
export const authRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: json429,
    skip: () => process.env.NODE_ENV === "test",
});
