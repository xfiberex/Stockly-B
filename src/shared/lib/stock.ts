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
 * Tres reglas que cumplen todas las funciones de este archivo:
 *
 * - **Dentro de una transacción.** Todas reciben el cliente de una.
 * - **El producto se bloquea antes que el nivel.** La venta ya bloqueaba la fila del producto
 *   antes de contar lo comprometido; si aquí se tocara primero el nivel, una venta y un ajuste
 *   del mismo producto podrían esperarse en cruz.
 * - **Sacar es un decremento condicional** (ADR 0001), ahora sobre el nivel: la comprobación y
 *   la resta son una sola sentencia.
 */

type Tx = Prisma.TransactionClient;

interface Movimiento {
    productId: string;
    warehouseId: string;
    type: StockMovementType;
    note?: string | null;
    /** T5-09 — la línea de compra que recibe esta entrada. */
    purchaseOrderItemId?: string;
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

/** Lo que hay de cada producto en un almacén. El que no aparece en el mapa está a cero. */
export async function nivelesEn(tx: Tx, warehouseId: string, productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const filas = await tx.stockLevel.findMany({
        where: { warehouseId, productId: { in: productIds } },
        select: { productId: true, stock: true },
    });
    return new Map(filas.map((f) => [f.productId, f.stock]));
}

/** Suma al nivel, creándolo si no existía. Devuelve lo que queda en el almacén. */
async function subirNivel(tx: Tx, productId: string, warehouseId: string, cantidad: number): Promise<number> {
    const [fila] = await tx.$queryRaw<Array<{ stock: number }>>`
        INSERT INTO stock_levels (id, "productId", "warehouseId", stock)
        VALUES (gen_random_uuid()::text, ${productId}, ${warehouseId}, ${cantidad})
        ON CONFLICT ("productId", "warehouseId") DO UPDATE SET stock = stock_levels.stock + EXCLUDED.stock
        RETURNING stock`;
    return fila!.stock;
}

/** Resta del nivel **si alcanza**. Devuelve lo que queda, o `null` si no había bastante. */
async function bajarNivel(tx: Tx, productId: string, warehouseId: string, cantidad: number): Promise<number | null> {
    const filas = await tx.$queryRaw<Array<{ stock: number }>>`
        UPDATE stock_levels SET stock = stock - ${cantidad}
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND stock >= ${cantidad}
        RETURNING stock`;
    return filas[0]?.stock ?? null;
}

async function nivelActual(tx: Tx, productId: string, warehouseId: string): Promise<number> {
    return (await nivelesEn(tx, warehouseId, [productId])).get(productId) ?? 0;
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
            ...(m.purchaseOrderItemId && { purchaseOrderItemId: m.purchaseOrderItemId }),
        },
    });
}

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
    alta: { warehouseId: string; type: StockMovementType; note: string; productos: Array<{ id: string; stock: number }> },
): Promise<void> {
    const conStock = alta.productos.filter((p) => p.stock !== 0);
    if (conStock.length === 0) return;

    await tx.stockLevel.createMany({
        data: conStock.map((p) => ({ productId: p.id, warehouseId: alta.warehouseId, stock: p.stock })),
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
        })),
    });
}

/** Mete `cantidad` unidades en un almacén y lo anota. */
export async function entrar(tx: Tx, m: Movimiento & { cantidad: number }): Promise<Movido> {
    const producto = await cambiarTotal(tx, m.productId, m.cantidad);
    const warehouseStock = await subirNivel(tx, m.productId, m.warehouseId, m.cantidad);
    await anotar(tx, m, m.cantidad, producto.stock, warehouseStock);
    return { ...producto, warehouseStock, delta: m.cantidad };
}

/**
 * Saca `cantidad` unidades de un almacén y lo anota. Si en **ese almacén** no hay bastante,
 * lanza lo que devuelva `alFaltar` —que recibe lo que sí hay, para el mensaje— y no queda nada
 * escrito: el error deshace la transacción.
 *
 * `alFaltar` es obligatorio a propósito. Cada sitio que saca stock tiene su propio error
 * —una venta, una cancelación de compra, una salida a mano—, y un valor por defecto dejaría que
 * uno nuevo respondiera con el de otro sin que nadie lo eligiera.
 */
export async function sacar(
    tx: Tx,
    m: Movimiento & { cantidad: number },
    alFaltar: (enAlmacen: number, producto: { name: string }) => HttpError,
): Promise<Movido> {
    const producto = await cambiarTotal(tx, m.productId, -m.cantidad);
    const warehouseStock = await bajarNivel(tx, m.productId, m.warehouseId, m.cantidad);
    if (warehouseStock === null) {
        throw alFaltar(await nivelActual(tx, m.productId, m.warehouseId), producto);
    }
    await anotar(tx, m, -m.cantidad, producto.stock, warehouseStock);
    return { ...producto, warehouseStock, delta: -m.cantidad };
}

/**
 * Deja el nivel de un almacén en `cantidad`, sea cual sea el que hubiera: el ajuste de
 * inventario. Bloquea el producto **antes** de leer el nivel, así que la diferencia que anota
 * es contra lo que había de verdad y no contra una lectura que otra operación ya cambió.
 *
 * Si no hay diferencia no escribe nada, ni el movimiento: `delta` vuelve a 0.
 */
export async function fijar(tx: Tx, m: Movimiento & { cantidad: number }): Promise<Movido> {
    await bloquearProductos(tx, [m.productId]);
    const delta = m.cantidad - (await nivelActual(tx, m.productId, m.warehouseId));
    return aplicar(tx, m, delta);
}

/**
 * Aplica una diferencia ya calculada —positiva o negativa— al nivel de un almacén: el cierre de
 * un conteo, que la trae de «contado − esperado». Quien llama tiene que haber comprobado, con
 * el producto bloqueado, que el nivel no queda negativo; si aun así no alcanza, es un 500 y no
 * un error de negocio.
 */
export async function aplicar(tx: Tx, m: Movimiento, delta: number): Promise<Movido> {
    if (delta === 0) {
        const [producto] = await tx.$queryRaw<FilaDeProducto[]>`
            SELECT stock, name, "minStock", "costPrice" FROM products WHERE id = ${m.productId}`;
        if (!producto) throw productoNoEncontrado();
        return { ...producto, warehouseStock: await nivelActual(tx, m.productId, m.warehouseId), delta };
    }

    const producto = await cambiarTotal(tx, m.productId, delta);

    const warehouseStock = delta > 0
        ? await subirNivel(tx, m.productId, m.warehouseId, delta)
        : await bajarNivel(tx, m.productId, m.warehouseId, -delta);
    if (warehouseStock === null) {
        throw new Error(`El ajuste dejaría en negativo el producto ${m.productId} en el almacén ${m.warehouseId}`);
    }
    await anotar(tx, m, delta, producto.stock, warehouseStock);
    return { ...producto, warehouseStock, delta };
}

/**
 * Pasa `cantidad` unidades de un almacén a otro: una salida y una entrada **en la misma
 * transacción**, enlazadas por `transferId`. El total del producto no cambia —ni se escribe—,
 * y por eso las dos mitades llevan el mismo `stockAfter`.
 */
export async function transferir(
    tx: Tx,
    t: { productId: string; fromWarehouseId: string; toWarehouseId: string; cantidad: number; transferId: string; note?: string | null },
    alFaltar: (enAlmacen: number) => HttpError,
): Promise<{ fromStockAfter: number; toStockAfter: number }> {
    // El total no se toca, pero su fila se bloquea igual: es lo que pone en fila a esta
    // transferencia con una venta o un ajuste del mismo producto.
    const [producto] = await tx.$queryRaw<Array<{ stock: number }>>`
        SELECT stock FROM products WHERE id = ${t.productId} FOR UPDATE`;
    if (!producto) throw productoNoEncontrado();

    const fromStockAfter = await bajarNivel(tx, t.productId, t.fromWarehouseId, t.cantidad);
    if (fromStockAfter === null) throw alFaltar(await nivelActual(tx, t.productId, t.fromWarehouseId));
    const toStockAfter = await subirNivel(tx, t.productId, t.toWarehouseId, t.cantidad);

    const comun = { productId: t.productId, type: "TRANSFER" as const, stockAfter: producto.stock, transferId: t.transferId, note: t.note ?? null };
    await tx.stockMovement.createMany({
        data: [
            { ...comun, warehouseId: t.fromWarehouseId, delta: -t.cantidad, warehouseStockAfter: fromStockAfter },
            { ...comun, warehouseId: t.toWarehouseId, delta: t.cantidad, warehouseStockAfter: toStockAfter },
        ],
    });

    return { fromStockAfter, toStockAfter };
}
