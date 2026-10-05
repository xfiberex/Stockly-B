import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { hoyEn } from "@/shared/lib/zonaHoraria";
import { settingsService } from "@/modules/settings/settings.service";
import { Prisma } from "@/generated/prisma/client";

/**
 * T5-10 — clasificación ABC de productos por facturación.
 *
 * Se ordenan los productos por lo que facturaron en el periodo y se reparten: **A** hasta el
 * 80 % acumulado, **B** hasta el 95 %, **C** el resto. Los que no vendieron nada son C, no
 * desaparecen: no tienen fila en `product_abc` y el catálogo los lee como C.
 *
 * **El periodo son los doce meses naturales completos anteriores al actual**, en la zona del
 * negocio. Sin el mes en curso, la clase no cambia a mitad de mes por una venta de hoy, y doce
 * meses recogen la temporada entera de un producto estacional.
 *
 * **Es una caché, y se recalcula sola.** El catálogo filtra por clase y ese filtro tiene que ir
 * en el `where` (T4-15); calcularla en cada listado costaría recorrer un año de ventas por
 * página. Así que el primer listado tras un cambio de periodo o de zona, o pasado un día, la
 * vuelve a escribir entera, y el resto la leen. Un día basta: el mes en curso no cuenta, y lo
 * único que cambia un mes cerrado es cancelar una venta enviada.
 *
 * **Y ese listado no la espera.** Con el conjunto de carga, reescribirla cuesta ~5 s (medido en
 * rendimiento.md §11); el catálogo sirve la anterior y el recálculo sigue detrás. Solo
 * se espera cuando no hay ninguna todavía: sin ella, todos los productos saldrían C.
 */

/** Cada cuánto se da por vieja la clasificación aunque el periodo no haya cambiado. */
export const VIGENCIA_ABC_MS = 24 * 60 * 60 * 1000;

/**
 * Llave del bloqueo consultivo que evita dos recálculos a la vez. Un número cualquiera, fijo:
 * lo único que importa es que no lo use otra cosa.
 */
const LLAVE_DE_BLOQUEO = 510_010;

export interface PeriodoAbc {
    from: string;
    to: string;
}

/** Los doce meses naturales completos anteriores al mes de `hoy` (`YYYY-MM-DD`). */
export function periodoAbc(hoy: string): PeriodoAbc {
    const [anio, mes] = hoy.split("-").map(Number);
    // `Date.UTC` con meses fuera de rango pasa de año solo: mes 0 es diciembre del anterior.
    const desde = new Date(Date.UTC(anio, mes - 1 - 12, 1));
    const hasta = new Date(Date.UTC(anio, mes - 1, 0));
    return { from: desde.toISOString().slice(0, 10), to: hasta.toISOString().slice(0, 10) };
}

/**
 * Reescribe `product_abc` para el periodo, en una sola sentencia que no saca ninguna fila de la
 * base.
 *
 * **Céntimos en `float8`, y es exacto.** `unitPrice` tiene dos decimales, así que
 * `cantidad × precio × 100` es un entero, y un `float8` suma enteros sin error hasta 2⁵³
 * céntimos. Con `numeric` el estado de cada grupo es una estructura aparte y, con cien mil
 * productos, la agregación no cabe en memoria (lo midió T5-09 en la misma consulta). La
 * exactitud importa aquí más que en otros informes: el criterio pide que el producto que cae
 * **justo** en el 80 % sea A, y eso es una comparación de igualdad.
 *
 * **La regla del corte: cuenta lo acumulado *antes* del producto.** Es A si lo que facturaron
 * los que van por delante no llega al 80 %. Así el producto que cruza la línea es A, el que cae
 * justo en ella también, y el más vendido lo es siempre —con «acumulado incluyéndolo ≤ 80 %», un
 * producto que factura el 85 % de todo sería B y no habría ningún A—.
 *
 * **Los empates comparten clase.** «Los que van por delante» son los que facturan
 * **estrictamente más**, así que dos productos con la misma cifra no quedan uno en A y otro en B
 * según el orden en que salgan. Como las cifras son céntimos enteros, «estrictamente más» es
 * «al menos un céntimo más»: el marco `RANGE … AND 1 PRECEDING` sobre la clave `bigint`.
 *
 * **No con `EXCLUDE GROUP`, que dice lo mismo y fue la primera versión.** Una exclusión obliga a
 * PostgreSQL a recalcular la suma del marco fila a fila, en vez de ir acumulándola: con los
 * ~100 000 productos vendidos del conjunto de carga pasaba de cinco minutos sin terminar. Con el
 * marco empezando en `UNBOUNDED PRECEDING` y sin exclusión, la suma avanza con la fila.
 *
 * Las comparaciones van multiplicadas (`antes × 5 < total × 4` es `antes / total < 0.8`) para
 * no dividir: con enteros en `float8`, multiplicar por 5 o por 20 sigue siendo exacto.
 *
 * Las ventas son las mismas que cuenta el informe por periodo (T5-09): **enviadas**, por
 * `shippedAt`, al precio del ítem. Las líneas de un producto borrado no tienen a quién
 * clasificar y no cuentan, ni en su fila ni en el total.
 */
async function escribirClasificacion(tx: Prisma.TransactionClient, periodo: PeriodoAbc, zona: string) {
    await tx.$executeRaw`DELETE FROM product_abc`;
    await tx.$executeRaw`
        WITH ventas AS (
            SELECT soi."productId" AS pid,
                   SUM((soi.quantity * soi."unitPrice" * 100)::float8) AS centimos
            FROM sale_orders so
            JOIN sale_order_items soi ON soi."saleOrderId" = so.id
            WHERE so.status = 'SHIPPED'
              AND so."shippedAt" >= ((${periodo.from}::date::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
              AND so."shippedAt" < (((${periodo.to}::date + 1)::timestamp) AT TIME ZONE ${zona} AT TIME ZONE 'UTC')
              AND soi."productId" IS NOT NULL
            GROUP BY soi."productId"
            HAVING SUM((soi.quantity * soi."unitPrice" * 100)::float8) > 0
        ),
        acumulado AS (
            SELECT pid,
                   centimos,
                   COALESCE(SUM(centimos) OVER (
                       ORDER BY centimos::bigint DESC
                       RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                   ), 0) AS antes,
                   SUM(centimos) OVER () AS total
            FROM ventas
        )
        INSERT INTO product_abc ("productId", "abcClass", revenue)
        SELECT pid,
               (CASE WHEN antes * 5 < total * 4 THEN 'A'
                     WHEN antes * 20 < total * 19 THEN 'B'
                     ELSE 'C' END)::"AbcClass",
               (centimos::numeric / 100)
        FROM acumulado
    `;
}

/** Si la última clasificación sirve para este periodo y esta zona, y aún no ha caducado. */
function vigente(
    calculo: { from: string; to: string; timezone: string; calculatedAt: Date } | null,
    periodo: PeriodoAbc,
    zona: string,
    ahora: Date,
) {
    return (
        calculo !== null &&
        calculo.from === periodo.from &&
        calculo.to === periodo.to &&
        calculo.timezone === zona &&
        ahora.getTime() - calculo.calculatedAt.getTime() < VIGENCIA_ABC_MS
    );
}

export const abcService = {
    /**
     * Recalcula la clasificación **ahora**, aunque la guardada siga vigente.
     *
     * Con un bloqueo consultivo de transacción, y **sin esperar**: si otra petición ya está
     * recalculando, esta sigue con la clasificación anterior en vez de hacer cola para repetir
     * el mismo trabajo. Devuelve si ha llegado a recalcular.
     */
    async recalcular(ahora: Date = new Date()): Promise<boolean> {
        const zona = await settingsService.zonaHoraria();
        const periodo = periodoAbc(hoyEn(zona, ahora));

        return prisma.$transaction(
            async (tx) => {
                const [{ libre }] = await tx.$queryRaw<Array<{ libre: boolean }>>`
                    SELECT pg_try_advisory_xact_lock(${LLAVE_DE_BLOQUEO}) AS libre
                `;
                if (!libre) return false;

                await escribirClasificacion(tx, periodo, zona);
                const datos = { from: periodo.from, to: periodo.to, timezone: zona, calculatedAt: ahora };
                await tx.abcCalculation.upsert({ where: { id: 1 }, update: datos, create: { id: 1, ...datos } });
                return true;
            },
            // Con un año del conjunto de carga la agregación ronda el segundo; los 5 s por
            // defecto de Prisma quedan justos si la base está ocupada.
            { timeout: 30_000 },
        );
    },

    /**
     * Deja la clasificación al día si no lo está. Es lo que llama el catálogo antes de leerla:
     * cuando está vigente, cuesta leer una fila de `abc_calculations` y la zona.
     */
    async asegurar(ahora: Date = new Date()) {
        const [calculo, zona] = await Promise.all([
            prisma.abcCalculation.findUnique({ where: { id: 1 } }),
            settingsService.zonaHoraria(),
        ]);
        if (!vigente(calculo, periodoAbc(hoyEn(zona, ahora)), zona, ahora)) {
            await abcService.recalcular(ahora);
        }
    },

    /**
     * Lo que llama el catálogo: como `asegurar`, pero **sin esperar** si ya hay una
     * clasificación que servir. Un recálculo que falle en segundo plano se registra y deja la
     * anterior; el siguiente listado lo vuelve a intentar.
     */
    async refrescar(ahora: Date = new Date()) {
        const [calculo, zona] = await Promise.all([
            prisma.abcCalculation.findUnique({ where: { id: 1 } }),
            settingsService.zonaHoraria(),
        ]);
        if (vigente(calculo, periodoAbc(hoyEn(zona, ahora)), zona, ahora)) return;

        if (calculo === null) {
            await abcService.recalcular(ahora);
            return;
        }
        abcService.recalcular(ahora).catch((err) => {
            logger.error({ err }, "No se pudo recalcular la clasificación ABC");
        });
    },

    /**
     * `GET /reports/abc` — de qué periodo sale la clasificación y cuántos productos hay en cada
     * clase. C cuenta **todos** los que no son A ni B, con ventas o sin ellas, activos o no:
     * es lo que devuelve el catálogo al filtrar por C.
     */
    async resumen() {
        await abcService.asegurar();

        const [calculo, porClase, totalProductos] = await Promise.all([
            prisma.abcCalculation.findUniqueOrThrow({ where: { id: 1 } }),
            prisma.productAbc.groupBy({ by: ["abcClass"], where: { abcClass: { in: ["A", "B"] } }, _count: true }),
            prisma.product.count(),
        ]);

        const cuenta = (clase: "A" | "B") => porClase.find((f) => f.abcClass === clase)?._count ?? 0;
        const a = cuenta("A");
        const b = cuenta("B");

        return {
            from: calculo.from,
            to: calculo.to,
            timezone: calculo.timezone,
            calculatedAt: calculo.calculatedAt,
            counts: { A: a, B: b, C: totalProductos - a - b },
        };
    },
};
