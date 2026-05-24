import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env";
import { router } from "../src/routes";

const app = express();

app.use(helmet());

// Configuración de CORS
app.use(cors({
    origin: env.nodeEnv === "production" ? process.env.FRONTEND_URL : "*",
    credentials: true,
}));

// Registro de peticiones en desarrollo
if (env.nodeEnv === "development") {
    app.use(morgan("dev"));
}

// Middleware para parsear JSON y URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Limitador de tasa para prevenir abuso
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
}));

// Rutas de la API
app.use("/api/v1", router);

export default app;