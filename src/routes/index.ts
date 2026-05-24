import { Router } from "express";

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});