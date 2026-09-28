import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { comprometidoPorProducto } from "@/shared/lib/stockComprometido";
import { hoyEn } from "@/shared/lib/zonaHoraria";
import { settingsService } from "@/modules/settings/settings.service";
import { mesesDe, resolverPeriodo } from "./reports.periodo";

// Forma del resumen que consumen tanto el JSON como el generador de PDF.
export type ReportSummary = Awaited<ReturnType<typeof reportsService.getSummary>>;

/** Una fila de la tabla de rotación del dashboard. */
type FilaDeRotacion = {
    productId: string;
    productName: string;
    sku: string | null;
    totalOut: bigint;
    currentStock: number;
    minStock: number;
};

/**
 * T4-16 — cuántos productos por rotación se traen **antes** de descartar los inactivos.
 *
 * La consulta agrega los movimientos, se queda con los primeros por unidades salidas y solo
 * entonces mira si el producto sigue activo. Ese orden es el que evita tocar el catálogo:
 * con el filtro dentro del `JOIN`, PostgreSQL tiene que recorrer los 95 000 productos
 * activos para poder cruzarlos, y vuelve el `Seq Scan` que esta tarea venía a quitar
 * —medido: 56 ms con el escaneo frente a **20 sin él**—.
 *
 * El margen existe porque entre esos primeros puede haber productos inactivos que no
 * cuentan. Medido sobre el conjunto de carga: **17 de los 500 primeros** están inactivos.
 * Aun así el número no es una garantía, y por eso no se confía en él: si la consulta rápida
 * devuelve menos de 20 filas, `getSummary` repite con la variante exacta. El margen es un
 * atajo, no una apuesta.
 */
const MARGEN_DE_ROTACION = 500;

const SELECCION_DE_ROTACION = Prisma.sql`
    p.id AS "productId", p.name AS "productName", p.sku,
    m."totalOut", p.stock AS "currentStock", p."minStock"
`;

const MOVIMIENTOS_DE_SALIDA = Prisma.sql`
    SELECT sm."productId" AS id, SUM(ABS(sm.delta)) AS "totalOut"
    FROM stock_movements sm
    WHERE sm.type = 'OUT' AND sm."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY sm."productId"
`;

/**
 * El desempate por `p.id` no es cosmético: **seis productos empatan** en el valor de corte
 * del conjunto de carga, y sin un orden total cuáles entran en el top 20 cambia entre
 * recargas de la misma pantalla sin que nada haya cambiado.
 */
const rotacionRapida = Prisma.sql`
    SELECT ${SELECCION_DE_ROTACION}
    FROM (${MOVIMIENTOS_DE_SALIDA} ORDER BY "totalOut" DESC, sm."productId" LIMIT ${MARGEN_DE_ROTACION}) m
    JOIN products p ON p.id = m.id AND p."isActive" = true
    ORDER BY m."totalOut" DESC, p.id
    LIMIT 20
`;

/** Sin límite interior: no puede devolver de menos, y por eso paga el escaneo del catálogo. */
const rotacionExacta = Prisma.sql`
    SELECT ${SELECCION_DE_ROTACION}
    FROM (${MOVIMIENTOS_DE_SALIDA}) m
    JOIN products p ON p.id = m.id AND p."isActive" = true
    ORDER BY m."totalOut" DESC, p.id
    LIMIT 20
`;

/**
 * T5-02 — la ventana del margen realizado. La misma que la rotación, para que las dos tablas
 * del informe hablen del mismo mes; los rangos de fechas a elección son T5-09.
 */
export const DIAS_DE_MARGEN = 30;

/**
 * Ventas enviadas dentro de la ventana, que es de lo único que sale un margen realizado. Van
 * separados el origen y el filtro porque el desglose por categoría necesita meter sus
 * `JOIN` entre los dos.
 */
const ITEMS_VENDIDOS = Prisma.sql`
    FROM sale_orders so
    JOIN sale_order_items soi ON soi."saleOrderId" = so.id
`;
const EN_LA_VENTANA = Prisma.sql`
    so.status = 'SHIPPED'
    AND so."shippedAt" >= NOW() - make_interval(days => ${DIAS_DE_MARGEN})
`;

type FilaDeMargen = { revenue: number; cost: number };

/** Margen y porcentaje sobre ventas; sin ventas no hay porcentaje, no un 0 %. */
function conMargen<T extends FilaDeMargen>(fila: T) {
    const revenue = Number(fila.revenue);
    const cost = Number(fila.cost);
    const margin = revenue - cost;
    return { ...fila, revenue, cost, margin, marginPercent: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null };
}

/**
 * T5-02 — margen realizado de las ventas enviadas en la ventana. Tres consultas en paralelo;
 * comparten el filtro y ninguna depende de otra.
 *
 * Solo cuentan los ítems con `unitCost`. Los que no lo tienen —producto sin coste, ítem
 * escrito a mano o venta anterior a T5-02— no se suman como coste cero, que daría un margen
 * del 100 %: se informa de cuánto se vendió así, para que se sepa qué parte de las ventas
 * queda fuera del cálculo.
 */
function consultarMargen() {
    return Promise.all([
        prisma.$queryRaw<Array<FilaDeMargen & { revenueWithoutCost: number }>>`
            SELECT
                COALESCE(SUM(soi.quantity * soi."unitPrice") FILTER (WHERE soi."unitCost" IS NOT NULL), 0)::float8 AS revenue,
                COALESCE(SUM(soi.quantity * soi."unitCost"), 0)::float8 AS cost,
                COALESCE(SUM(soi.quantity * soi."unitPrice") FILTER (WHERE soi."unitCost" IS NULL), 0)::float8 AS "revenueWithoutCost"
            ${ITEMS_VENDIDOS}
            WHERE ${EN_LA_VENTANA}
        `,
        // Por la categoría **actual** del producto: el ítem no la congela. Un producto
        // borrado o sin categoría sale con `name` a NULL, y **no** con el «Sin categoría»
        // que pone el desglose de stock: ese literal llega en español a una interfaz en
        // inglés. La etiqueta la pone quien pinta, en su idioma.
        prisma.$queryRaw<Array<FilaDeMargen & { name: string | null }>>`
            SELECT
                c.name AS name,
                SUM(soi.quantity * soi."unitPrice")::float8 AS revenue,
                SUM(soi.quantity * soi."unitCost")::float8 AS cost
            ${ITEMS_VENDIDOS}
            LEFT JOIN products p ON p.id = soi."productId"
            LEFT JOIN categories c ON c.id = p."categoryId"
            WHERE ${EN_LA_VENTANA} AND soi."unitCost" IS NOT NULL
            GROUP BY 1
            ORDER BY SUM(soi.quantity * (soi."unitPrice" - soi."unitCost")) DESC, 1 NULLS LAST
        `,
        // Top 10 por margen en importe, no en porcentaje: un 90 % sobre una venta de $5
        // no es lo que se quiere ver arriba. El nombre es el congelado en el ítem, así
        // que un producto borrado sigue saliendo con el suyo.
        prisma.$queryRaw<Array<FilaDeMargen & { productId: string | null; name: string; units: bigint }>>`
            SELECT
                soi."productId",
                MAX(soi."productName") AS name,
                SUM(soi.quantity)::bigint AS units,
                SUM(soi.quantity * soi."unitPrice")::float8 AS revenue,
                SUM(soi.quantity * soi."unitCost")::float8 AS cost
            ${ITEMS_VENDIDOS}
            WHERE ${EN_LA_VENTANA} AND soi."unitCost" IS NOT NULL
            GROUP BY soi."productId"
            ORDER BY SUM(soi.quantity * (soi."unitPrice" - soi."unitCost")) DESC, soi."productId"
            LIMIT 10
        `,
    ]);
}

// ─────────────────────── T5-09 — informes por periodo ───────────────────────

/**
 * Los extremos del periodo, como instantes UTC comparables con las columnas.
 *
 * Prisma guarda las fechas en `timestamp` **sin zona** y en UTC. `'2026-03-01'::timestamp AT
 * TIME ZONE 'America/Santo_Domingo'` lee esa medianoche como hora de Santo Domingo y da el
 * instante (`timestamptz`); el segundo `AT TIME ZONE 'UTC'` lo vuelve a escribir en UTC y sin
 * zona, que es lo que hay en la columna. PostgreSQL sabe los cambios de horario de cada zona, así
 * que un mes con cambio de hora dura lo que tiene que durar. `hasta` es la medianoche **del día
 * siguiente** a `to`, y se compara con `<`: el último día entra entero.
 */
function extremos(from: string, to: string, zona: string) {
    return {
        desde: Prisma.sql`((${from}::date::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`,
        hasta: Prisma.sql`(((${to}::date + 1)::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')`,
    };
}

type Tramo = { desde: Prisma.Sql; hasta: Prisma.Sql };

/**
 * Ventas: las **enviadas**, por su `shippedAt`, que es cuando la mercancía salió (T5-02). Las
 * canceladas después de enviarse no cuentan: el estado ya dice que no son una venta. Al precio
 * congelado en el ítem, no al de hoy.
 */
const DE_VENTAS = Prisma.sql`
    FROM sale_orders so
    JOIN sale_order_items soi ON soi."saleOrderId" = so.id
`;
const ventasEn = ({ desde, hasta }: Tramo) => Prisma.sql`
    so.status = 'SHIPPED' AND so."shippedAt" >= ${desde} AND so."shippedAt" < ${hasta}
`;

/**
 * Compras: cada **recepción**, por la fecha de su movimiento de entrada, al precio de su línea.
 * Una orden recibida a medias en dos meses cuenta en los dos, cada parte en el suyo. Las de una
 * orden cancelada no cuentan: la cancelación sacó esas unidades del inventario.
 *
 * Las líneas escritas a mano, sin producto, no dejan movimiento —no entran en el inventario— y
 * por tanto tampoco están aquí: el informe es de lo que entró en el almacén.
 */
const DE_COMPRAS = Prisma.sql`
    FROM stock_movements sm
    JOIN purchase_order_items poi ON poi.id = sm."purchaseOrderItemId"
    JOIN purchase_orders po ON po.id = poi."purchaseOrderId"
`;
const comprasEn = ({ desde, hasta }: Tramo) => Prisma.sql`
    sm.type = 'IN' AND po.status <> 'CANCELLED'
    AND sm."createdAt" >= ${desde} AND sm."createdAt" < ${hasta}
`;

/** Lo que tiene cada fila del informe: unidades e importe, de ventas y de compras. */
type CifrasDelPeriodo = {
    salesUnits: bigint | number;
    salesRevenue: number;
    purchaseUnits: bigint | number;
    purchaseAmount: number;
};

function cifras<T extends CifrasDelPeriodo>(fila: T) {
    return {
        ...fila,
        salesUnits: Number(fila.salesUnits),
        salesRevenue: Number(fila.salesRevenue),
        purchaseUnits: Number(fila.purchaseUnits),
        purchaseAmount: Number(fila.purchaseAmount),
    };
}

/** Productos del desglose en pantalla y en el PDF. El CSV los lleva todos. */
export const PRODUCTOS_POR_PERIODO = 50;

/**
 * Por producto, ventas y compras en la misma fila: un producto que solo se compró en el
 * periodo, o que solo se vendió, tiene que salir igual.
 *
 * **Una sola agregación, sobre la unión de las dos fuentes.** La primera versión agregaba
 * ventas y compras por separado y las cruzaba con un `FULL JOIN`; con el año del conjunto de
 * carga —443 000 líneas, 100 000 productos— las dos agregaciones y el cruce **ordenaban en
 * disco** (`external merge`, ~15 MB por proceso) y tardaban 1.8 s. Unidas, es un único
 * `HashAggregate` sin ordenación previa, y cada fila del grupo lleva solo lo imprescindible:
 * la clave y cuatro sumas que caben en un registro —`int8` y `float8`, no `numeric`, cuyo
 * estado de suma es una estructura aparte por grupo—. El `float8` no pierde céntimos aquí: cada
 * término es exacto en `numeric` antes de convertirse, y el error de sumar miles de términos
 * queda muy por debajo del redondeo a dos decimales. Los totales, que suman el periodo entero,
 * siguen en `numeric`.
 *
 * La clave es el producto o, si se borró, el nombre congelado en la línea con un `~` delante,
 * que no puede coincidir con un id: dos productos borrados distintos no se funden en una fila.
 * Nombre, SKU y categoría son los **actuales**, y se buscan **después** del `LIMIT`: para 51
 * filas, no para 100 000.
 *
 * No hay recuento total: `COUNT(*) OVER ()` obliga a guardar todos los grupos antes de dar el
 * primero, que es justo lo que se evita. Se pide uno más de los que se enseñan y eso dice si
 * hay más.
 */
function productosDelPeriodo(tramo: Tramo, limite: number | null) {
    return prisma.$queryRaw<Array<CifrasDelPeriodo & {
        productId: string | null;
        name: string;
        sku: string | null;
        category: string | null;
    }>>`
        WITH lineas AS (
            SELECT COALESCE(soi."productId", '~' || soi."productName") AS clave,
                   soi.quantity AS su,
                   (soi.quantity * soi."unitPrice")::float8 AS sr,
                   0 AS pu,
                   0::float8 AS pa
            ${DE_VENTAS}
            WHERE ${ventasEn(tramo)}
            UNION ALL
            SELECT COALESCE(poi."productId", '~' || poi."productName"),
                   0,
                   0::float8,
                   sm.delta,
                   (sm.delta * poi."unitPrice")::float8
            ${DE_COMPRAS}
            WHERE ${comprasEn(tramo)}
        ),
        agregado AS (
            SELECT clave, SUM(su) AS su, SUM(sr) AS sr, SUM(pu) AS pu, SUM(pa) AS pa
            FROM lineas
            GROUP BY clave
            ORDER BY sr DESC, pa DESC, clave
            ${limite === null ? Prisma.empty : Prisma.sql`LIMIT ${limite}`}
        )
        SELECT p.id AS "productId",
               COALESCE(p.name, CASE WHEN a.clave LIKE '~%' THEN substr(a.clave, 2) END) AS name,
               p.sku,
               cat.name AS category,
               a.su AS "salesUnits",
               a.sr AS "salesRevenue",
               a.pu AS "purchaseUnits",
               a.pa AS "purchaseAmount"
        FROM agregado a
        LEFT JOIN products p ON p.id = a.clave
        LEFT JOIN categories cat ON cat.id = p."categoryId"
        ORDER BY a.sr DESC, a.pa DESC, a.clave
    `;
}

export const reportsService = {
    async getSummary() {
        // T5-02 — el margen arranca a la vez que el resto y se recoge más abajo: esperarlo
        // después sumaría sus ~190 ms a la primera pantalla tras el login (medido sobre el
        // conjunto de carga). El `catch` vacío no lo silencia —el `await` de abajo sigue
        // fallando—; solo evita un rechazo sin manejar si antes falla el otro bloque.
        const margenEnCurso = consultarMargen();
        margenEnCurso.catch(() => undefined);

        // T5-09 — el gráfico de movimientos va por meses del negocio. Es una lectura por
        // clave primaria de `app_settings`; mientras, el margen ya está en marcha.
        const zona = await settingsService.zonaHoraria();

        const [
            totalProducts,
            activeProducts,
            totalesDeInventario,
            porCategoria,
            topByValue,
            movementsByMonth,
            lowStockProducts,
            stockMetrics,
        ] = await Promise.all([
            prisma.product.count(),
            prisma.product.count({ where: { isActive: true } }),
            // T2-02 — el valor de inventario y el recuento de stock bajo, en la base.
            //
            // Antes esto era un `findMany` sin `take` que traía **el catálogo activo
            // entero** al proceso Node —todas las filas, con su categoría— para sumar en
            // JavaScript dos números y contar cuántas cumplen una condición. Es la
            // consulta que alimenta el dashboard, la primera pantalla tras el login: el
            // coste crece con el catálogo aunque el resultado sean cinco cifras.
            //
            // `COUNT(*) FILTER (WHERE …)` recorre la tabla una sola vez para las dos
            // cosas, y `SUM` sobre `numeric` suma en decimal exacto en vez de acumular
            // errores de coma flotante producto a producto.
            //
            // T5-02 — y el valor **a coste**, en la misma pasada. El valor a precio de venta
            // incluye un beneficio que todavía no existe; el de coste es lo que hay invertido.
            // Los productos sin coste no suman cero: se cuentan aparte, y el margen potencial
            // se calcula solo sobre los que tienen coste —restar el coste de unos al precio
            // de todos daría un margen inflado por los que no se saben—.
            prisma.$queryRaw<Array<{
                inventoryValue: number;
                inventoryCostValue: number;
                costedSaleValue: number;
                productsWithoutCost: bigint;
                lowStockCount: bigint;
            }>>`
                SELECT
                    COALESCE(SUM(price * stock), 0)::float8 AS "inventoryValue",
                    COALESCE(SUM("costPrice" * stock) FILTER (WHERE "costPrice" IS NOT NULL), 0)::float8 AS "inventoryCostValue",
                    COALESCE(SUM(price * stock) FILTER (WHERE "costPrice" IS NOT NULL), 0)::float8 AS "costedSaleValue",
                    COUNT(*) FILTER (WHERE "costPrice" IS NULL AND stock > 0) AS "productsWithoutCost",
                    COUNT(*) FILTER (WHERE stock <= "minStock") AS "lowStockCount"
                FROM products
                WHERE "isActive" = true
            `,
            // Stock y valor por categoría, agrupados también en la base. El `COALESCE`
            // del nombre reproduce el «Sin categoría» que ponía el bucle de JavaScript.
            prisma.$queryRaw<Array<{ name: string; stock: number; value: number }>>`
                SELECT
                    COALESCE(c.name, 'Sin categoría') AS name,
                    COALESCE(SUM(p.stock), 0)::int AS stock,
                    COALESCE(SUM(p.price * p.stock), 0)::float8 AS value
                FROM products p
                LEFT JOIN categories c ON c.id = p."categoryId"
                WHERE p."isActive" = true
                GROUP BY 1
                ORDER BY value DESC
            `,
            // Top 10 por valor de inventario (precio × stock), no por cantidad.
            prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; price: string; stock: number }>>`
                SELECT id, name, sku, price, stock
                FROM products
                WHERE "isActive" = true
                ORDER BY price * stock DESC
                LIMIT 10
            `,
            /**
             * Movimientos por mes, últimos 6 meses (T4-16).
             *
             * **La segunda consulta que se iba a disco, y esta no la nombraba la ficha.**
             * `GROUP BY TO_CHAR("createdAt",'YYYY-MM'), type` agrupa por una **expresión**,
             * de la que PostgreSQL no tiene estadísticas: estima muchísimos grupos, descarta
             * el `HashAggregate` y elige `GroupAggregate`, que **ordena las 360 725 filas de
             * la ventana** para devolver 24. Esa ordenación no cabe en `work_mem` y acaba en
             * `external merge` de 7 800 kB.
             *
             * Aquí se recorre mes a mes con un `LATERAL`, y dentro de cada mes se agrupa solo
             * por `type` —una columna de verdad, cuatro valores—: `HashAggregate`, sin
             * ordenación. Seis recorridos por rango de índice en lugar de una ordenación
             * completa. Medido: **275.6 ms → 74.8 ms**, y en memoria.
             *
             * T5-09 — **meses naturales del negocio**: el mes en curso y los cinco anteriores
             * completos, cada uno de medianoche a medianoche en la zona del ajuste
             * `timezone`. Hasta T5-09 la ventana rodaba seis meses desde hoy y el mes más
             * antiguo salía a medias: una barra corta que no correspondía a menos actividad.
             * T4-16 la conservó a propósito —cambiarla era una decisión de producto— y la ficha
             * de T5-09 era donde tomarla. Solo el mes en curso puede ir a medias, y ese se sabe
             * que está sin terminar.
             *
             * `g.mes` es una medianoche **local** sin zona; `AT TIME ZONE` la convierte al
             * instante UTC en que empieza ese mes en el negocio, que es como se guardan las
             * fechas. Sigue siendo un recorrido por rango de índice por mes.
             */
            prisma.$queryRaw<Array<{ month: string; type: string; total: bigint }>>`
                SELECT TO_CHAR(g.mes, 'YYYY-MM') AS month, c.type, c.total
                FROM generate_series(
                        date_trunc('month', NOW() AT TIME ZONE ${zona}) - INTERVAL '5 months',
                        date_trunc('month', NOW() AT TIME ZONE ${zona}),
                        INTERVAL '1 month') AS g(mes),
                     LATERAL (
                        SELECT sm.type, COUNT(*)::bigint AS total
                        FROM stock_movements sm
                        WHERE sm."createdAt" >= (g.mes AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
                          AND sm."createdAt" < ((g.mes + INTERVAL '1 month') AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
                        GROUP BY sm.type
                     ) c
                ORDER BY g.mes ASC
            `,
            // Productos con stock bajo
            prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; stock: number; minStock: number; categoryName: string | null }>>`
                SELECT p.id, p.name, p.sku, p.stock, p."minStock",
                       c.name AS "categoryName"
                FROM products p
                LEFT JOIN categories c ON c.id = p."categoryId"
                WHERE p."isActive" = true AND p.stock <= p."minStock"
                ORDER BY p.stock ASC
                LIMIT 20
            `,
            /**
             * Rotación: unidades salidas por producto en los últimos 30 días (T4-16).
             *
             * **Antes se agregaba el catálogo entero para quedarse con veinte filas.** El
             * `LEFT JOIN` partía de `products` con `WHERE isActive`, así que agrupaba los
             * 95 051 productos activos —incluidos los 85 000 sin una sola salida en el mes—
             * y ordenaba el resultado: una ordenación de 20 000 grupos que **no cabía en
             * `work_mem`** y se iba a disco (`external merge`, 8 072 kB).
             *
             * Ahora se parte de los movimientos, que son 31 501 en la ventana de 30 días y
             * producen 9 967 grupos. Medido sobre el conjunto de carga, mejor de cinco
             * pasadas:
             *
             *   original, work_mem 4MB (de fábrica)   401.6 ms   ordena en disco
             *   original, work_mem 64MB               121.1 ms   en memoria
             *   **esta, work_mem de fábrica**          **20.0 ms**   en memoria
             *
             * Las dos devuelven **los mismos veinte productos con los mismos totales**,
             * comprobado fila a fila sobre 100 000 productos.
             *
             * Y esa tercera fila es la razón por la que **no se toca `work_mem`**, que era
             * la otra mitad de lo que pedía la ficha: subirlo a 64 MB arreglaba el síntoma
             * —×3.3— a cambio de multiplicar por cada conexión y por cada nodo de ordenación
             * la memoria que puede pedir el servidor. Reescribir la consulta da ×20 y no
             * compromete memoria de nadie. La configuración se deja como está a propósito.
             */
            prisma.$queryRaw<FilaDeRotacion[]>(rotacionRapida),
        ]);

        const [margenTotal, margenPorCategoria, margenPorProducto] = await margenEnCurso;

        // Si el margen no bastó, se repite sin él. Es el caso raro —haría falta que casi
        // todos los primeros por rotación estuvieran inactivos— y cuesta 56 ms; lo que no
        // puede pasar es que el dashboard enseñe catorce filas donde hay veinte.
        const rotacion =
            stockMetrics.length < 20
                ? await prisma.$queryRaw<FilaDeRotacion[]>(rotacionExacta)
                : stockMetrics;

        // Un `GROUP BY` sin filas no devuelve ninguna, así que la fila de totales sí
        // existe siempre (es un agregado sin agrupación) pero conviene no darla por hecha.
        const inventoryValue = Number(totalesDeInventario[0]?.inventoryValue ?? 0);
        const inventoryCostValue = Number(totalesDeInventario[0]?.inventoryCostValue ?? 0);
        const costedSaleValue = Number(totalesDeInventario[0]?.costedSaleValue ?? 0);
        const productsWithoutCost = Number(totalesDeInventario[0]?.productsWithoutCost ?? 0);
        const lowStockCount = Number(totalesDeInventario[0]?.lowStockCount ?? 0);

        // T5-03 — los días hasta quedarse sin nada se cuentan sobre el **disponible**, no sobre
        // el stock: lo comprometido en ventas pendientes ya tiene dueño, y contarlo como
        // cobertura retrasaba el aviso de reponer justo en los productos que más se venden.
        // Son veinte filas: una consulta agrupada, no veinte.
        const comprometido = await comprometidoPorProducto(rotacion.map((m) => m.productId));

        // Calcular métricas de rotación y proyección
        const rotationMetrics = rotacion.map((m) => {
            const totalOut = Number(m.totalOut);
            const dailyVelocity = totalOut / 30;
            const availableStock = Number(m.currentStock) - (comprometido.get(m.productId) ?? 0);
            const daysToStockout = dailyVelocity > 0 ? Math.max(0, Math.floor(availableStock / dailyVelocity)) : null;
            const reorderSoon = daysToStockout !== null && daysToStockout <= 14;

            return {
                productId: m.productId,
                productName: m.productName,
                sku: m.sku,
                currentStock: Number(m.currentStock),
                availableStock,
                minStock: Number(m.minStock),
                totalOutLast30Days: totalOut,
                dailyVelocity: Math.round(dailyVelocity * 100) / 100,
                daysToStockout,
                reorderSoon,
            };
        });

        return {
            totals: {
                totalProducts,
                activeProducts,
                inactiveProducts: totalProducts - activeProducts,
                inventoryValue,
                inventoryCostValue,
                potentialMargin: costedSaleValue - inventoryCostValue,
                productsWithoutCost,
                lowStockCount,
            },
            stockByCategory: porCategoria.map((c) => ({
                name: c.name,
                stock: Number(c.stock),
                value: Number(c.value),
            })),
            topByValue: topByValue.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                price: Number(p.price),
                stock: p.stock,
                totalValue: Number(p.price) * p.stock,
            })),
            movementsByMonth: movementsByMonth.map((m) => ({
                month: m.month,
                type: m.type,
                total: Number(m.total),
            })),
            lowStockProducts: lowStockProducts.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                stock: Number(p.stock),
                minStock: Number(p.minStock),
                category: p.categoryName ?? null,
            })),
            stockMetrics: rotationMetrics,
            margin: {
                days: DIAS_DE_MARGEN,
                ...conMargen({
                    revenue: margenTotal[0]?.revenue ?? 0,
                    cost: margenTotal[0]?.cost ?? 0,
                }),
                revenueWithoutCost: Number(margenTotal[0]?.revenueWithoutCost ?? 0),
                byCategory: margenPorCategoria.map((c) => conMargen({ name: c.name, revenue: c.revenue, cost: c.cost })),
                topProducts: margenPorProducto.map((p) =>
                    conMargen({ productId: p.productId, name: p.name, units: Number(p.units), revenue: p.revenue, cost: p.cost }),
                ),
            },
        };
    },

    /**
     * T5-09 — ventas enviadas y compras recibidas de un periodo: totales, por mes, por
     * categoría y los productos que más facturaron. Cinco consultas en paralelo; ninguna
     * depende de otra.
     *
     * Los totales se calculan con su propia consulta y **no** sumando los meses, aunque darían lo
     * mismo: así «la suma de los meses coincide con el trimestre», que es el criterio de la
     * ficha, compara dos cálculos y no uno consigo mismo.
     */
    async getPeriod(query: { preset?: unknown; from?: unknown; to?: unknown }) {
        const zona = await settingsService.zonaHoraria();
        const periodo = resolverPeriodo(query, hoyEn(zona));
        const tramo = extremos(periodo.from, periodo.to, zona);

        const [ventas, compras, porMes, porCategoria, productos] = await Promise.all([
            // Las órdenes se cuentan aparte y no con `COUNT(DISTINCT so.id)` sobre las líneas:
            // ese `DISTINCT` ordena todas las líneas del periodo, y con el año del conjunto de
            // carga eran 443 000 filas **ordenadas en disco** (~9 MB por proceso, 1.2 s).
            prisma.$queryRaw<Array<{ orders: bigint; units: bigint; importe: number }>>`
                SELECT (SELECT COUNT(*) FROM sale_orders so WHERE ${ventasEn(tramo)}) AS orders,
                       COALESCE(SUM(soi.quantity), 0)::bigint AS units,
                       COALESCE(SUM(soi.quantity * soi."unitPrice"), 0)::float8 AS importe
                ${DE_VENTAS}
                WHERE ${ventasEn(tramo)}
            `,
            // Las órdenes con alguna recepción en el periodo, con `EXISTS`: un semijoin por
            // hash, sin ordenar. Agrupar las recepciones por orden para contar los grupos
            // también evitaba el `DISTINCT`, pero el planificador lo resolvía ordenando
            // (medido: 4.5 MB a disco por proceso con el año del conjunto de carga).
            prisma.$queryRaw<Array<{ orders: bigint; units: bigint; importe: number }>>`
                SELECT (
                           SELECT COUNT(*) FROM purchase_orders po
                           WHERE po.status <> 'CANCELLED'
                             AND EXISTS (
                                 SELECT 1
                                 FROM purchase_order_items poi
                                 JOIN stock_movements sm ON sm."purchaseOrderItemId" = poi.id
                                 WHERE poi."purchaseOrderId" = po.id
                                   AND sm.type = 'IN'
                                   AND sm."createdAt" >= ${tramo.desde} AND sm."createdAt" < ${tramo.hasta}
                             )
                       ) AS orders,
                       COALESCE(SUM(sm.delta), 0)::bigint AS units,
                       COALESCE(SUM(sm.delta * poi."unitPrice"), 0)::float8 AS importe
                ${DE_COMPRAS}
                WHERE ${comprasEn(tramo)}
            `,
            /**
             * Un mes por fila, **también los que no tienen nada**: un hueco en la serie se
             * leería como que el mes no existe. Los meses de los extremos quedan recortados al
             * periodo sin hacer nada: las filas ya vienen filtradas por sus extremos.
             *
             * **Una pasada, cruzando cada fila con su mes.** La primera versión recorría el
             * periodo mes a mes con un `LATERAL`, como el gráfico de T4-16; con un año del
             * conjunto de carga eran 443 000 búsquedas por índice y **3.9 s**. Agrupar por la
             * expresión del mes tampoco sirve: PostgreSQL no tiene estadísticas de una
             * expresión, estima demasiados grupos y ordena todas las filas (el defecto que
             * T4-16 encontró en el gráfico). Aquí cada fila se une a la lista de meses por el
             * texto `YYYY-MM` de su fecha **local**, y se agrupa por la columna de esa lista.
             *
             * **La lista va como `VALUES` y no con `generate_series`**, y no es cosmético: de
             * `generate_series` sobre fechas el planificador supone 1 000 filas, y con eso
             * prefirió un `Merge Join` que **ordenaba en disco** las 443 000 líneas del año.
             * Con los meses escritos sabe que son doce, los mete en un hash y agrupa en memoria.
             *
             * **Y el cruce de órdenes y líneas va aparte, tras un `OFFSET 0`.** Del cruce con los
             * meses el planificador estima una fila de cada doscientas —no puede saber que todas
             * caen en algún mes—, y con esa cifra le salía más barato buscar las líneas de cada
             * orden por índice: 221 000 búsquedas, 1.7 s de los 2.3 que tardaba el año. El
             * `OFFSET 0` le obliga a planificar la subconsulta por su cuenta, con el `Hash Join`
             * en paralelo de los totales, y a cruzar con los meses lo que ya salió de ahí.
             */
            prisma.$queryRaw<Array<CifrasDelPeriodo & { month: string }>>`
                WITH lista (month) AS (
                    VALUES ${Prisma.join(mesesDe(periodo.from, periodo.to).map((mes) => Prisma.sql`(${mes})`))}
                ),
                meses AS MATERIALIZED (
                    SELECT month,
                           (to_date(month, 'YYYY-MM')::timestamp AT TIME ZONE ${zona} AT TIME ZONE 'UTC') AS desde,
                           ((to_date(month, 'YYYY-MM') + INTERVAL '1 month')::timestamp AT TIME ZONE ${zona} AT TIME ZONE 'UTC') AS hasta
                    FROM lista
                ),
                ventas AS (
                    SELECT meses.month, SUM(l.units)::bigint AS units, SUM(l.importe)::float8 AS importe
                    FROM (
                        SELECT so."shippedAt" AS fecha, soi.quantity AS units, soi.quantity * soi."unitPrice" AS importe
                        ${DE_VENTAS}
                        WHERE ${ventasEn(tramo)}
                        OFFSET 0
                    ) l
                    JOIN meses ON l.fecha >= meses.desde AND l.fecha < meses.hasta
                    GROUP BY meses.month
                ),
                compras AS (
                    SELECT meses.month, SUM(l.units)::bigint AS units, SUM(l.importe)::float8 AS importe
                    FROM (
                        SELECT sm."createdAt" AS fecha, sm.delta AS units, sm.delta * poi."unitPrice" AS importe
                        ${DE_COMPRAS}
                        WHERE ${comprasEn(tramo)}
                        OFFSET 0
                    ) l
                    JOIN meses ON l.fecha >= meses.desde AND l.fecha < meses.hasta
                    GROUP BY meses.month
                )
                SELECT meses.month,
                       COALESCE(v.units, 0) AS "salesUnits",
                       COALESCE(v.importe, 0) AS "salesRevenue",
                       COALESCE(c.units, 0) AS "purchaseUnits",
                       COALESCE(c.importe, 0) AS "purchaseAmount"
                FROM meses
                LEFT JOIN ventas v ON v.month = meses.month
                LEFT JOIN compras c ON c.month = meses.month
                ORDER BY meses.month
            `,
            // Por la categoría **actual** del producto, como el margen (T5-02). `name` a NULL
            // para lo que no tiene categoría o ya no tiene producto: la etiqueta la pone
            // quien pinta, en su idioma.
            prisma.$queryRaw<Array<CifrasDelPeriodo & { name: string | null }>>`
                WITH ventas AS (
                    SELECT p."categoryId" AS cid,
                           SUM(soi.quantity)::bigint AS units,
                           SUM(soi.quantity * soi."unitPrice") AS importe
                    ${DE_VENTAS}
                    LEFT JOIN products p ON p.id = soi."productId"
                    WHERE ${ventasEn(tramo)}
                    GROUP BY 1
                ),
                compras AS (
                    SELECT p."categoryId" AS cid,
                           SUM(sm.delta)::bigint AS units,
                           SUM(sm.delta * poi."unitPrice") AS importe
                    ${DE_COMPRAS}
                    LEFT JOIN products p ON p.id = poi."productId"
                    WHERE ${comprasEn(tramo)}
                    GROUP BY 1
                )
                SELECT cat.name AS name,
                       COALESCE(v.units, 0) AS "salesUnits",
                       COALESCE(v.importe, 0)::float8 AS "salesRevenue",
                       COALESCE(c.units, 0) AS "purchaseUnits",
                       COALESCE(c.importe, 0)::float8 AS "purchaseAmount"
                FROM ventas v
                -- Por un texto y no por la columna: el FULL JOIN necesita una igualdad que
                -- se pueda resolver con hash, y sin categoría las dos claves son NULL.
                FULL JOIN compras c ON COALESCE(c.cid, '') = COALESCE(v.cid, '')
                LEFT JOIN categories cat ON cat.id = COALESCE(v.cid, c.cid)
                ORDER BY "salesRevenue" DESC, "purchaseAmount" DESC, cat.name NULLS LAST
            `,
            // Uno más de los que se enseñan: si llega, hay más (ver `productosDelPeriodo`).
            productosDelPeriodo(tramo, PRODUCTOS_POR_PERIODO + 1),
        ]);

        return {
            ...periodo,
            timezone: zona,
            totals: {
                salesOrders: Number(ventas[0]?.orders ?? 0),
                salesUnits: Number(ventas[0]?.units ?? 0),
                salesRevenue: Number(ventas[0]?.importe ?? 0),
                purchaseOrders: Number(compras[0]?.orders ?? 0),
                purchaseUnits: Number(compras[0]?.units ?? 0),
                purchaseAmount: Number(compras[0]?.importe ?? 0),
            },
            byMonth: porMes.map((m) => cifras(m)),
            byCategory: porCategoria.map((c) => cifras(c)),
            byProduct: productos.slice(0, PRODUCTOS_POR_PERIODO).map((p) => cifras(p)),
            moreProducts: productos.length > PRODUCTOS_POR_PERIODO,
        };
    },

    /**
     * T5-09 — el desglose por producto **completo**, para el CSV. Sin el tope de pantalla: quien
     * exporta quiere la tabla entera. Es una fila por producto con actividad en el periodo, así
     * que cabe en memoria de una vez; el tope de filas de las exportaciones sigue aplicando.
     */
    async getPeriodProducts(query: { preset?: unknown; from?: unknown; to?: unknown }) {
        const zona = await settingsService.zonaHoraria();
        const periodo = resolverPeriodo(query, hoyEn(zona));
        const filas = await productosDelPeriodo(extremos(periodo.from, periodo.to, zona), null);
        return {
            periodo,
            filas: filas.map((p) => cifras(p)),
        };
    },
};

export type PeriodReport = Awaited<ReturnType<typeof reportsService.getPeriod>>;
