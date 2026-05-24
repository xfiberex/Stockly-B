import { Router } from "express";
import { productRouter } from "../modules/products";

export const router = Router();

// Ruta de salud para verificar que la API está funcionando correctamente
router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});

// Rutas para productos
router.use("/products", productRouter);