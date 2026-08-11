import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { env } from "@/config/env";
import { exponer } from "@/shared/lib/metricas";
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

/**
 * T4-06 — métricas en formato Prometheus.
 *
 * **No lleva `authMiddleware`.** Un raspador no tiene sesión ni cookies: pedirle un JWT
 * obliga a guardarle credenciales de usuario a un proceso automático, que es peor que lo
 * que se quiere evitar. El control es un token compartido, que es lo que Prometheus sabe
 * mandar (`authorization` en la configuración de `scrape_configs`).
 *
 * Sin `METRICS_TOKEN` configurado el endpoint **no existe en producción**: responde 404 y
 * no 401, para no confirmar siquiera que está ahí. Fuera de producción queda abierto,
 * porque tenerlo a mano es la mitad de su utilidad mientras se desarrolla.
 */
router.get("/metrics", async (req, res, next) => {
    const token = env.metricsToken;

    if (!token) {
        // `next()` y no un 404 escrito aquí: así la respuesta la compone el mismo
        // `notFoundHandler` que el resto, con su sobre y su registro, y esta ruta queda
        // indistinguible de una que no existe.
        if (env.nodeEnv === "production") return void next();
    } else {
        const cabecera = req.get("authorization") ?? "";
        const presentado = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";

        // Comparación en tiempo constante: un `!==` filtra por cuánto tarda en fallar
        // cuántos caracteres iniciales se acertaron, y con eso el token se adivina a
        // trozos. `timingSafeEqual` exige longitudes iguales, de ahí la comprobación
        // previa —que no filtra nada útil, la longitud no es secreta—.
        const a = Buffer.from(presentado);
        const b = Buffer.from(token);
        const valido = a.length === b.length && timingSafeEqual(a, b);

        if (!valido) {
            return void res.status(401).json({ success: false, message: "Token de métricas inválido", code: "UNAUTHORIZED" });
        }
    }

    const { cuerpo, tipo } = await exponer();
    res.set("content-type", tipo).send(cuerpo);
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
