import { Prisma, type StockMovementType } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";

/**
 * T5-14 — **el único sitio que cambia el stock de un producto.**
 *
 * Desde que hay varios almacenes, el stock vive en dos lugares: lo que hay en cada almacén
 * (`stock_levels`, la fuente de verdad) y el total del producto (`products.stock`), que se
 * conserva porque el panel, el stock bajo y la reposición lo leen de todo el catálogo a la vez
 * (ADR 0010). Dos escrituras que tienen que ir siempre juntas son una invitación a olvidar una,
 * así que van aquí y en ningún otro sitio: ningún servicio hace `product.update({ stock })`.
 *
 * Y si alguno lo hace, no llega lejos: el disparador `stock_cuadra` de la migración se niega a
 * confirmar una transacción en la que el total no sea la suma de los niveles.
 *
 * T5-15 — lo que hay en un almacén es **la suma de varias filas**, una por lote y otra para lo
 * que no tiene lote. Este archivo es también el único que decide **de cuál sale** cada unidad:
 * primero lo que no tiene lote —es lo más antiguo, de antes de que el producto los llevara— y
 * después por fecha de caducidad, la más cercana antes (FEFO). Un servicio dice cuánto sacar y,
 * si acaso, que solo vale lo no caducado; nunca recorre los lotes él (ADR 0011).
 *
 * Tres reglas que cumplen todas las funciones de este archivo:
 *
 * - **Dentro de una transacción.** Todas reciben el cliente de una.
 * - **El producto se bloquea antes que el nivel.** La venta ya bloqueaba la fila del producto
 *   antes de contar lo comprometido; si aquí se tocara primero el nivel, una venta y un ajuste
 *   del mismo producto podrían esperarse en cruz.
 * - **Sacar es un decremento condicional** (ADR 0001), ahora sobre el nivel: la comprobación,
 *   el reparto entre lotes y la resta son una sola sentencia.
 */

type Tx = Prisma.TransactionClient;

interface Movimiento {
    productId: string;
    warehouseId: string;
    type: StockMovementType;
    note?: string | null;
    /** T5-09 — la línea de compra que recibe esta entrada. */
    purchaseOrderItemId?: string;
    /**
     * T5-15 — el lote. En una entrada, al que se suma; sin él, al stock «sin lote». En una salida
     * o un ajuste, el **único** del que se saca; sin él, reparte este archivo.
     */
    lotId?: string | null;
}

/** T5-15 — cuántas unidades de un movimiento fueron de cada lote. `null` es «sin lote». */
export interface DeLote {
    lotId: string | null;
    cantidad: number;
}

/** Cómo quedó el producto tras el movimiento. Se lee con su fila bloqueada. */
export interface Movido {
    /** El total, en todos los almacenes: contra él se compara el mínimo. */
    stock: number;
    /** Lo que quedó en el almacén del movimiento. */
    warehouseStock: number;
    delta: number;
    name: string;
    minStock: number;
    costPrice: Prisma.Decimal | null;
    /** T5-15 — el reparto por lote, en el orden en que se tocaron. Vacío si no se movió nada. */
    lotes: DeLote[];
}

type FilaDeProducto = { stock: number; name: string; minStock: number; costPrice: Prisma.Decimal | null };

function productoNoEncontrado(): HttpError {
    return new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
}

/**
 * Bloquea las filas de varios productos hasta el final de la transacción, **en orden de id**:
 * dos operaciones con los mismos productos en distinto orden los piden igual y no se esperan
 * mutuamente.
 */
export async function bloquearProductos(tx: Tx, ids: string[]): Promise<void> {
    const ordenados = [...new Set(ids)].sort();
    if (ordenados.length === 0) return;
    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ordenados)}) ORDER BY id FOR UPDATE`;
}

/** De qué filas de un nivel se puede sacar. Sin nada, de todas. */
interface Origen {
    lotId?: string | null;
    vigentesA?: string;
}

/** La condición de `Origen`, sobre `stock_levels sl LEFT JOIN lots l`. */
function elegibles(origen: Origen): Prisma.Sql {
    if (origen.lotId) return Prisma.sql`sl."lotId" = ${origen.lotId}`;
    if (origen.vigentesA) return Prisma.sql`(l.id IS NULL OR l."expiresAt" >= ${origen.vigentesA}::date)`;
    return Prisma.sql`TRUE`;
}

/**
 * Lo que hay de cada producto en un almacén, **sumando sus lotes**. El que no aparece en el mapa
 * está a cero.
 *
 * T5-15 — con `vigentesA` (un día, `AAAA-MM-DD`) no cuenta lo caducado ese día: es lo que se
 * puede **vender o transferir**, que es menos que lo que hay en la estantería. Un lote caduca
 * al terminar su fecha, así que el que vence hoy todavía cuenta.
 */
export async function nivelesEn(
    tx: Tx,
    warehouseId: string,
    productIds: string[],
    opciones: { vigentesA?: string } = {},
): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const filas = await tx.$queryRaw<Array<{ productId: string; stock: number }>>`
        SELECT sl."productId", SUM(sl.stock)::int AS stock
        FROM stock_levels sl
        LEFT JOIN lots l ON l.id = sl."lotId"
        WHERE sl."warehouseId" = ${warehouseId} AND sl."productId" IN (${Prisma.join(productIds)}) AND ${elegibles(opciones)}
        GROUP BY sl."productId"`;
    return new Map(filas.map((f) => [f.productId, f.stock]));
}

/**
 * Suma a una fila del nivel —la del lote, o la de «sin lote»—, creándola si no existía. Devuelve
 * lo que queda **en el almacén**, sumadas todas sus filas.
 *
 * La suma de las demás filas se lee en la misma sentencia: ve la tabla como estaba antes del
 * `INSERT`, y por eso excluye la fila escrita y le añade su valor nuevo.
 */
async function subirNivel(tx: Tx, productId: string, warehouseId: string, lotId: string | null, cantidad: number): Promise<number> {
    const [fila] = await tx.$queryRaw<Array<{ stock: number }>>`
        WITH escrito AS (
            INSERT INTO stock_levels (id, "productId", "warehouseId", "lotId", stock)
            VALUES (gen_random_uuid()::text, ${productId}, ${warehouseId}, ${lotId}, ${cantidad})
            ON CONFLICT ("productId", "warehouseId", "lotId") DO UPDATE SET stock = stock_levels.stock + EXCLUDED.stock
            RETURNING id, stock
        )
        SELECT (e.stock + COALESCE((
            SELECT SUM(o.stock) FROM stock_levels o
            WHERE o."productId" = ${productId} AND o."warehouseId" = ${warehouseId} AND o.id <> e.id
        ), 0))::int AS stock
        FROM escrito e`;
    return fila!.stock;
}

/** Lo que `bajarNivel` quitó de una fila. */
interface Toma extends DeLote {
    /** Lo que quedó en el almacén, sumadas sus filas, después de esta parte. */
    enAlmacen: number;
}

/**
 * Resta `cantidad` del nivel **si alcanza**, repartida entre sus filas: primero la de «sin lote»
 * y después los lotes por fecha de caducidad (FEFO); a igual fecha, por código. Devuelve lo que
 * tomó de cada una, o `null` —sin haber escrito nada— si entre las filas de `origen` no había
 * bastante.
 *
 * Es **una sentencia**, como el decremento condicional del que viene (ADR 0001): la suma que
 * decide si alcanza, el reparto y la resta no dejan hueco entre ellos. `antes` es lo que ya se
 * ha tomado de las filas anteriores; de cada una se toma lo que tenga o lo que falte.
 *
 * Una fila en negativo —stock heredado de antes del ADR 0001— cuenta para decidir si alcanza,
 * pero de ella no se toma nada.
 */
async function bajarNivel(tx: Tx, productId: string, warehouseId: string, cantidad: number, origen: Origen): Promise<Toma[] | null> {
    // El camino corto, que es el de casi todo el catálogo: si lo que no tiene lote alcanza, sale
    // de ahí —es lo primero en el orden de salida, haya lotes o no— y basta el decremento
    // condicional de siempre. Medido sobre 100 000 productos: el reparto de abajo cuesta 0,45 ms
    // más por salida, y un producto sin lotes no tiene por qué pagarlo (rendimiento.md §16).
    if (!origen.lotId) {
        const [directa] = await tx.$queryRaw<Array<{ enAlmacen: number }>>`
            UPDATE stock_levels sl SET stock = sl.stock - ${cantidad}::int
            WHERE sl."productId" = ${productId} AND sl."warehouseId" = ${warehouseId}
              AND sl."lotId" IS NULL AND sl.stock >= ${cantidad}::int
            RETURNING (sl.stock + COALESCE((
                SELECT SUM(o.stock) FROM stock_levels o
                WHERE o."productId" = sl."productId" AND o."warehouseId" = sl."warehouseId" AND o.id <> sl.id
            ), 0))::int AS "enAlmacen"`;
        if (directa) return [{ lotId: null, cantidad, enAlmacen: directa.enAlmacen }];
    }

    const filas = await tx.$queryRaw<Array<{ id: string; queda: number; lotId: string | null; n: number; antes: number; en_almacen: number }>>`
        WITH filas AS (
            SELECT sl.id, sl.stock, sl."lotId", l.code, l."expiresAt",
                   ${elegibles(origen)} AS elegible,
                   SUM(sl.stock) OVER () AS en_almacen
            FROM stock_levels sl
            LEFT JOIN lots l ON l.id = sl."lotId"
            WHERE sl."productId" = ${productId} AND sl."warehouseId" = ${warehouseId}
        ), orden AS (
            SELECT f.*,
                   SUM(f.stock) OVER () AS alcanza,
                   COALESCE(SUM(GREATEST(f.stock, 0)) OVER (
                       ORDER BY f."expiresAt" NULLS FIRST, f.code, f.id
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                   ), 0) AS antes
            FROM filas f
            WHERE f.elegible
        ), toma AS (
            SELECT o.id, o."lotId", o.en_almacen, o.antes, LEAST(o.stock, ${cantidad}::int - o.antes) AS n
            FROM orden o
            WHERE o.alcanza >= ${cantidad}::int AND o.stock > 0 AND o.antes < ${cantidad}::int
        )
        UPDATE stock_levels sl SET stock = sl.stock - t.n
        FROM toma t
        WHERE sl.id = t.id
        RETURNING sl.id, sl.stock AS queda, t."lotId", t.n::int AS n, t.antes::int AS antes, t.en_almacen::int AS en_almacen`;
    if (filas.length === 0) return null;

    // Un lote agotado en un almacén no deja fila: el nivel es disperso, y si no, cada lote que
    // ha pasado por cada almacén se quedaría para siempre en la suma. La de «sin lote» sí se
    // queda a cero, como antes de los lotes.
    const agotadas = filas.filter((f) => f.lotId !== null && f.queda === 0).map((f) => f.id);
    if (agotadas.length > 0) {
        await tx.$executeRaw`DELETE FROM stock_levels WHERE id IN (${Prisma.join(agotadas)}) AND stock = 0`;
    }

    // `RETURNING` no promete orden; el del reparto es el de `antes`.
    return filas
        .sort((a, b) => a.antes - b.antes)
        .map((f) => ({ lotId: f.lotId, cantidad: f.n, enAlmacen: f.en_almacen - f.antes - f.n }));
}

async function nivelActual(tx: Tx, productId: string, warehouseId: string, origen: Origen = {}): Promise<number> {
    const [fila] = await tx.$queryRaw<Array<{ stock: number }>>`
        SELECT COALESCE(SUM(sl.stock), 0)::int AS stock
        FROM stock_levels sl
        LEFT JOIN lots l ON l.id = sl."lotId"
        WHERE sl."productId" = ${productId} AND sl."warehouseId" = ${warehouseId} AND ${elegibles(origen)}`;
    return fila!.stock;
}

/** Cambia el total del producto y devuelve su fila, que queda bloqueada. */
async function cambiarTotal(tx: Tx, productId: string, delta: number): Promise<FilaDeProducto> {
    const filas = await tx.$queryRaw<FilaDeProducto[]>`
        UPDATE products SET stock = stock + ${delta}, "updatedAt" = NOW() AT TIME ZONE 'UTC'
        WHERE id = ${productId}
        RETURNING stock, name, "minStock", "costPrice"`;
    if (filas.length === 0) throw productoNoEncontrado();
    return filas[0]!;
}

async function anotar(tx: Tx, m: Movimiento, delta: number, total: number, enAlmacen: number): Promise<void> {
    await tx.stockMovement.create({
        data: {
            productId: m.productId,
            warehouseId: m.warehouseId,
            type: m.type,
            delta,
            stockAfter: total,
            warehouseStockAfter: enAlmacen,
            note: m.note ?? null,
            lotId: m.lotId ?? null,
            ...(m.purchaseOrderItemId && { purchaseOrderItemId: m.purchaseOrderItemId }),
        },
    });
}

/**
 * T5-15 — los movimientos de una salida: **uno por lote tocado**, cada uno con lo que quedaba
 * después de él. `total` es el del producto cuando ya ha salido todo.
 */
async function anotarSalida(tx: Tx, m: Movimiento, tomas: Toma[], total: number): Promise<void> {
    let pendiente = tomas.reduce((suma, t) => suma + t.cantidad, 0);
    await tx.stockMovement.createMany({
        data: tomas.map((t) => {
            pendiente -= t.cantidad;
            return {
                productId: m.productId,
                warehouseId: m.warehouseId,
                type: m.type,
                delta: -t.cantidad,
                stockAfter: total + pendiente,
                warehouseStockAfter: t.enAlmacen,
                note: m.note ?? null,
                lotId: t.lotId,
            };
        }),
    });
}

const reparto = (tomas: Toma[]): DeLote[] => tomas.map(({ lotId, cantidad }) => ({ lotId, cantidad }));

/**
 * El stock con el que **nacen** unos productos recién creados: su nivel en un almacén y el
 * movimiento que lo explica. Es la única vez que el total no lo escribe este archivo —el
 * producto se inserta ya con su `stock`—, y por eso el alta y esta llamada van en la misma
 * transacción: sin ella, la base no la confirma.
 *
 * Dos sentencias para el lote entero, como la importación (T2-08), no dos por producto. Los
 * que nacen a cero no llevan ni nivel ni movimiento.
 */
export async function altaConStock(
    tx: Tx,
    alta: {
        warehouseId: string;
        type: StockMovementType;
        note: string;
        productos: Array<{ id: string; stock: number; lotId?: string | null }>;
    },
): Promise<void> {
    const conStock = alta.productos.filter((p) => p.stock !== 0);
    if (conStock.length === 0) return;

    await tx.stockLevel.createMany({
        data: conStock.map((p) => ({ productId: p.id, warehouseId: alta.warehouseId, lotId: p.lotId ?? null, stock: p.stock })),
    });
    await tx.stockMovement.createMany({
        data: conStock.map((p) => ({
            productId: p.id,
            warehouseId: alta.warehouseId,
            type: alta.type,
            delta: p.stock,
            stockAfter: p.stock,
            warehouseStockAfter: p.stock,
            note: alta.note,
            lotId: p.lotId ?? null,
        })),
    });
}

/**
 * Mete `cantidad` unidades en un almacén y lo anota. Con `lotId`, en ese lote; sin él, en el
 * stock «sin lote». Que un producto con lotes no reciba una entrada sin el suyo lo decide quien
 * llama (`loteDeEntrada`), no esto.
 */
export async function entrar(tx: Tx, m: Movimiento & { cantidad: number }): Promise<Movido> {
    const producto = await cambiarTotal(tx, m.productId, m.cantidad);
    const warehouseStock = await subirNivel(tx, m.productId, m.warehouseId, m.lotId ?? null, m.cantidad);
    await anotar(tx, m, m.cantidad, producto.stock, warehouseStock);
    return { ...producto, warehouseStock, delta: m.cantidad, lotes: [{ lotId: m.lotId ?? null, cantidad: m.cantidad }] };
}

/**
 * Saca `cantidad` unidades de un almacén y lo anota. Si en **ese almacén** no hay bastante,
 * lanza lo que devuelva `alFaltar` —que recibe lo que sí hay, para el mensaje— y no queda nada
 * escrito: el error deshace la transacción.
 *
 * T5-15 — de qué lotes sale lo decide `bajarNivel` (FEFO). `vigentesA` deja fuera lo caducado
 * ese día: lo pasan la venta y la transferencia, que no pueden entregar un lote vencido. Una
 * merma o la cancelación de una compra no lo pasan: lo caducado sigue estando ahí para sacarlo.
 *
 * `alFaltar` es obligatorio a propósito. Cada sitio que saca stock tiene su propio error
 * —una venta, una cancelación de compra, una salida a mano—, y un valor por defecto dejaría que
 * uno nuevo respondiera con el de otro sin que nadie lo eligiera.
 */
export async function sacar(
    tx: Tx,
    m: Movimiento & { cantidad: number; vigentesA?: string },
    alFaltar: (enAlmacen: number, producto: { name: string }) => HttpError,
): Promise<Movido> {
    const producto = await cambiarTotal(tx, m.productId, -m.cantidad);
    const tomas = await bajarNivel(tx, m.productId, m.warehouseId, m.cantidad, m);
    if (tomas === null) {
        throw alFaltar(await nivelActual(tx, m.productId, m.warehouseId, m), producto);
    }
    await anotarSalida(tx, m, tomas, producto.stock);
    return { ...producto, warehouseStock: tomas[tomas.length - 1]!.enAlmacen, delta: -m.cantidad, lotes: reparto(tomas) };
}

/**
 * Deja el nivel de un almacén en `cantidad`, sea cual sea el que hubiera: el ajuste de
 * inventario. Bloquea el producto **antes** de leer el nivel, así que la diferencia que anota
 * es contra lo que había de verdad y no contra una lectura que otra operación ya cambió.
 *
 * T5-15 — con `lotId`, lo que se fija es lo que hay **de ese lote** en el almacén: así se da de
 * baja un lote caducado, dejándolo a cero.
 *
 * Si no hay diferencia no escribe nada, ni el movimiento: `delta` vuelve a 0.
 */
export async function fijar(tx: Tx, m: Movimiento & { cantidad: number }): Promise<Movido> {
    await bloquearProductos(tx, [m.productId]);
    const delta = m.cantidad - (await nivelActual(tx, m.productId, m.warehouseId, { lotId: m.lotId }));
    return aplicar(tx, m, delta);
}

/**
 * Aplica una diferencia ya calculada —positiva o negativa— al nivel de un almacén: el cierre de
 * un conteo, que la trae de «contado − esperado». Quien llama tiene que haber comprobado, con
 * el producto bloqueado, que el nivel no queda negativo; si aun así no alcanza, es un 500 y no
 * un error de negocio.
 *
 * T5-15 — sin `lotId`, lo que sobra va al stock **«sin lote»** —se han encontrado unidades y
 * nadie ha dicho de qué lote son— y lo que falta sale por FEFO, caducado incluido.
 */
export async function aplicar(tx: Tx, m: Movimiento, delta: number): Promise<Movido> {
    if (delta === 0) {
        const [producto] = await tx.$queryRaw<FilaDeProducto[]>`
            SELECT stock, name, "minStock", "costPrice" FROM products WHERE id = ${m.productId}`;
        if (!producto) throw productoNoEncontrado();
        return { ...producto, warehouseStock: await nivelActual(tx, m.productId, m.warehouseId), delta, lotes: [] };
    }

    const producto = await cambiarTotal(tx, m.productId, delta);

    if (delta > 0) {
        const warehouseStock = await subirNivel(tx, m.productId, m.warehouseId, m.lotId ?? null, delta);
        await anotar(tx, m, delta, producto.stock, warehouseStock);
        return { ...producto, warehouseStock, delta, lotes: [{ lotId: m.lotId ?? null, cantidad: delta }] };
    }

    const tomas = await bajarNivel(tx, m.productId, m.warehouseId, -delta, { lotId: m.lotId });
    if (tomas === null) {
        throw new Error(`El ajuste dejaría en negativo el producto ${m.productId} en el almacén ${m.warehouseId}`);
    }
    await anotarSalida(tx, m, tomas, producto.stock);
    return { ...producto, warehouseStock: tomas[tomas.length - 1]!.enAlmacen, delta, lotes: reparto(tomas) };
}

/**
 * Pasa `cantidad` unidades de un almacén a otro: una salida y una entrada **en la misma
 * transacción**, enlazadas por `transferId`. El total del producto no cambia —ni se escribe—,
 * y por eso las dos mitades llevan el mismo `stockAfter`.
 *
 * T5-15 — lo que viaja **conserva su lote**: sale por FEFO, sin lo caducado a `vigentesA`, y
 * entra en el destino en el mismo lote. Son dos movimientos por lote tocado.
 */
export async function transferir(
    tx: Tx,
    t: {
        productId: string;
        fromWarehouseId: string;
        toWarehouseId: string;
        cantidad: number;
        transferId: string;
        note?: string | null;
        vigentesA?: string;
    },
    alFaltar: (enAlmacen: number) => HttpError,
): Promise<{ fromStockAfter: number; toStockAfter: number }> {
    // El total no se toca, pero su fila se bloquea igual: es lo que pone en fila a esta
    // transferencia con una venta o un ajuste del mismo producto.
    const [producto] = await tx.$queryRaw<Array<{ stock: number }>>`
        SELECT stock FROM products WHERE id = ${t.productId} FOR UPDATE`;
    if (!producto) throw productoNoEncontrado();

    const origen = { vigentesA: t.vigentesA };
    const tomas = await bajarNivel(tx, t.productId, t.fromWarehouseId, t.cantidad, origen);
    if (tomas === null) throw alFaltar(await nivelActual(tx, t.productId, t.fromWarehouseId, origen));

    const comun = { productId: t.productId, type: "TRANSFER" as const, stockAfter: producto.stock, transferId: t.transferId, note: t.note ?? null };
    const movimientos: Prisma.StockMovementCreateManyInput[] = [];
    let toStockAfter = 0;
    for (const toma of tomas) {
        toStockAfter = await subirNivel(tx, t.productId, t.toWarehouseId, toma.lotId, toma.cantidad);
        movimientos.push(
            { ...comun, lotId: toma.lotId, warehouseId: t.fromWarehouseId, delta: -toma.cantidad, warehouseStockAfter: toma.enAlmacen },
            { ...comun, lotId: toma.lotId, warehouseId: t.toWarehouseId, delta: toma.cantidad, warehouseStockAfter: toStockAfter },
        );
    }
    await tx.stockMovement.createMany({ data: movimientos });

    return { fromStockAfter: tomas[tomas.length - 1]!.enAlmacen, toStockAfter };
}
