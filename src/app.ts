import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "@/config/env";
import { router } from "@/routes";
import { errorHandler } from "@/shared/middlewares/error.middleware";
import { registerSwagger } from "@/swagger";

const app = express();

app.use(helmet());

app.use(cors({
    origin: env.frontendUrl,
    credentials: true,
}));

if (env.nodeEnv === "development") {
    app.use(morgan("dev"));
}

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

// Rate limit global — los limitadores específicos de auth se aplican adicionalmente
// Se omite en test para no bloquear ejecuciones repetidas del suite
if (env.nodeEnv !== "test") {
    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
    }));
}

app.use("/api/v1", router);

if (env.nodeEnv !== "production") {
    registerSwagger(app);
}

app.use(errorHandler);

export default app;
