import { Router } from "express";
import { productRouter } from "@/modules/products";
import { authRouter } from "@/modules/auth";

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});

router.use("/auth", authRouter);
router.use("/products", productRouter);
