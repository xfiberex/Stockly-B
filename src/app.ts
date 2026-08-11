import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { env } from "@/config/env";
import { logger, generarRequestId } from "@/shared/lib/logger";
import { router } from "@/routes";
import { errorHandler } from "@/shared/middlewares/error.middleware";
import { csrfProtection } from "@/shared/middlewares/csrf.middleware";
import { metricas } from "@/shared/middlewares/metricas.middleware";
import { notFoundHandler } from "@/shared/middlewares/notFound.middleware";
import { registerSwagger } from "@/swagger";

const app = express();

/** Ruta tal y como la pidió el cliente, antes de que el router la reescriba. */
const rutaPedida = (req: { url?: string; originalUrl?: string }) => req.originalUrl ?? req.url;

app.use(helmet());

app.use(cors({
    origin: env.frontendUrl,
    credentials: true,
}));

// Log de peticiones (T2-10). Va antes que todo lo demás para que también queden
// registradas las que mueren en el rate limit o en la comprobación CSRF, que son
// precisamente las que a uno le interesa buscar después.
app.use(pinoHttp({
    logger,
    genReqId: generarRequestId,
    // El 4xx es un cliente equivocado, no una avería: aviso, no error. El 5xx sí.
    customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
    // `req.url` NO sirve aquí: Express lo reescribe al entrar en un router montado,
    // así que todas las peticiones acababan con el mensaje «GET /». La ruta que
    // pidió el cliente está en `originalUrl`.
    customSuccessMessage: (req, res) => `${req.method} ${rutaPedida(req)} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${rutaPedida(req)} → ${res.statusCode}: ${err.message}`,
}));

// Métricas y detección de picos de 5xx (T4-06). Va justo detrás del log y **antes** del
// rate limit por el mismo motivo que aquel: un 429 o un 403 de CSRF son peticiones
// atendidas y tienen que contarse. Instrumentar después del router —el sitio donde
// intuitivamente se pone— no mediría nada: las peticiones responden dentro de él y nunca
// llegan a lo que hay detrás.
app.use(metricas);

// T2-33 — el cuerpo grande solo donde se justifica.
//
// Los 5 MB estaban puestos globalmente por una única ruta, la importación masiva: en
// todas las demás, aceptar 5 MB es regalar memoria y CPU de parseo a cualquiera que
// mande basura, y ninguna de ellas recibe más de un formulario.
//
// El orden es lo que decide cuál se aplica: `body-parser` marca la petición al
// parsearla y el siguiente parser se abstiene, así que **el específico va antes** que
// el general. Al revés no tendría efecto — el global ya habría rechazado el cuerpo.
const LIMITE_GENERAL = "100kb";
const LIMITE_IMPORTACION = "5mb";

app.use("/api/v1/products/import", express.json({ limit: LIMITE_IMPORTACION }));
app.use(express.json({ limit: LIMITE_GENERAL }));
app.use(express.urlencoded({ extended: true, limit: LIMITE_GENERAL }));
app.use(cookieParser());

// Rate limit global — los limitadores específicos de auth se aplican adicionalmente.
// Se omite en test para no bloquear ejecuciones repetidas del suite.
// `RATE_LIMIT_MAX` existe por el E2E: una sola pasada del navegador supera con
// holgura las 100 peticiones y el 429 hacía fallar pruebas que no iban de eso.
if (env.nodeEnv !== "test") {
    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
    }));
}

// Protección CSRF (double-submit) antes de las rutas mutantes
app.use(csrfProtection);

app.use("/api/v1", router);

if (env.nodeEnv !== "production") {
    registerSwagger(app);
}

// Va después de Swagger, no solo del router: lo que se monta más tarde nunca llegaría
// a verse. Y antes del manejador de errores, que es quien escribe el sobre.
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
