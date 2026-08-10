import { Router } from "express";
import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { productRouter } from "@/modules/products";
import { authRouter } from "@/modules/auth";
import { categoriesRouter } from "@/modules/categories";
import { brandsRouter } from "@/modules/brands";
import { suppliersRouter } from "@/modules/suppliers";
import { purchaseOrdersRouter } from "@/modules/purchase-orders";
import { reportsRouter } from "@/modules/reports";
import { tagsRouter } from "@/modules/tags";
import { usersRouter } from "@/modules/users";
import { settingsRouter } from "@/modules/settings";
import { auditLogsRouter } from "@/modules/audit-logs";
import { saleOrdersRouter } from "@/modules/sale-orders";

export const router = Router();

/**
 * Vivacidad: ¿responde el proceso?
 *
 * No consulta nada a propósito. Es la sonda que decide si hay que **reiniciar** el
 * contenedor, y reiniciarlo porque la base de datos esté caída no arregla nada: deja al
 * servicio dando tumbos mientras el problema está en otro sitio.
 */
router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});

/**
 * T2-25 — disponibilidad: ¿puede atender peticiones de verdad?
 *
 * `/health` respondía 200 con la base caída, así que un orquestador seguía mandándole
 * tráfico a un servicio que iba a fallar en todas las rutas menos esa. Aquí se comprueba
 * lo único que hace falta para servir: que la conexión a la base funcione.
 *
 * `SELECT 1` y no una consulta a una tabla: no depende del esquema, así que sigue
 * significando lo mismo cuando cambien los modelos.
 */
router.get("/ready", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ success: true, message: "API lista para recibir tráfico" });
    } catch (error) {
        // 503 y no 500: no es una avería del servicio, es que aún no está disponible.
        // Esa distinción es la que usa un orquestador para decidir si retira el
        // contenedor del balanceo o lo reinicia.
        (req.log ?? logger).warn({ err: error }, "La sonda de disponibilidad no pudo consultar la base de datos");
        res.status(503).json({ success: false, message: "La base de datos no está disponible" });
    }
});

router.use("/auth", authRouter);
router.use("/products", productRouter);
router.use("/categories", categoriesRouter);
router.use("/brands", brandsRouter);
router.use("/suppliers", suppliersRouter);
router.use("/purchase-orders", purchaseOrdersRouter);
router.use("/sale-orders", saleOrdersRouter);
router.use("/reports", reportsRouter);
router.use("/tags", tagsRouter);
router.use("/users", usersRouter);
router.use("/settings", settingsRouter);
router.use("/audit-logs", auditLogsRouter);
