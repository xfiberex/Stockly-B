import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/lib/prisma";
import type { NivelDeStock } from "@/contratos/api";
import { hoyDelNegocio } from "@/shared/lib/lotes";

/** El cliente de Prisma o el de una transacción: los dos sirven para leer. */
type Cliente = Pick<typeof prisma, "$queryRaw">;

/**
 * T5-03 — unidades comprometidas: las pedidas en ventas **pendientes**. T5-14 — **por almacén**:
 * una venta pendiente compromete el stock del almacén del que va a salir, no el de otro.
 *
 * Una venta pendiente no descuenta stock —eso lo hace el envío—, pero ya está prometida a un
 * cliente. Sin restarla, el catálogo enseñaba como vendible lo que ya estaba vendido, y el
 * problema aparecía al enviar la segunda venta de las mismas unidades.
 *
 * Solo cuentan los ítems ligados a un producto; los escritos a mano no tienen stock que
 * comprometer. Lo que no aparece en el mapa está a cero.
 */
export async function comprometidoPorAlmacen(productIds: string[], cliente: Cliente = prisma): Promise<Map<string, Map<string, number>>> {
    const porProducto = new Map<string, Map<string, number>>();
    if (productIds.length === 0) return porProducto;

    const filas = await cliente.$queryRaw<Array<{ productId: string; warehouseId: string; unidades: number }>>`
        SELECT soi."productId", so."warehouseId", SUM(soi.quantity)::int AS unidades
        FROM sale_order_items soi
        JOIN sale_orders so ON so.id = soi."saleOrderId"
        WHERE so.status = 'PENDING' AND soi."productId" IN (${Prisma.join(productIds)})
        GROUP BY soi."productId", so."warehouseId"`;

    for (const f of filas) {
        const almacenes = porProducto.get(f.productId) ?? new Map<string, number>();
        almacenes.set(f.warehouseId, f.unidades);
        porProducto.set(f.productId, almacenes);
    }
    return porProducto;
}

/**
 * Lo comprometido de cada producto: en un almacén, si se dice cuál, o en todos. Un producto sin
 * ventas pendientes no aparece en el mapa: su comprometido es 0.
 */
export async function comprometidoPorProducto(productIds: string[], cliente: Cliente = prisma, warehouseId?: string): Promise<Map<string, number>> {
    const porAlmacen = await comprometidoPorAlmacen(productIds, cliente);
    const total = new Map<string, number>();

    for (const [productId, almacenes] of porAlmacen) {
        const unidades = warehouseId
            ? (almacenes.get(warehouseId) ?? 0)
            : [...almacenes.values()].reduce((suma, n) => suma + n, 0);
        if (unidades > 0) total.set(productId, unidades);
    }
    return total;
}

/**
 * Añade a cada producto su comprometido, su disponible y el desglose por almacén (T5-14). Dos
 * consultas para la página entera, no dos por producto.
 *
 * T5-15 — **lo caducado no está disponible**: `disponible = stock − caducado − comprometido`.
 * Sigue contando en `stock`, porque sigue en la estantería hasta que alguien lo dé de baja. Lo
 * que hay en un almacén es la suma de sus lotes; caducado es lo de los lotes cuya fecha ya pasó
 * en la zona del negocio.
 *
 * **El disponible puede salir negativo** y no se recorta a cero: con datos anteriores a T5-03
 * puede haber más vendido en pendiente que stock, y esconderlo detrás de un 0 taparía
 * justamente lo que hay que ver. Desde T5-03 no se puede llegar ahí creando ventas.
 *
 * `stockLevels` es disperso: trae los almacenes donde el producto tiene existencias o algo
 * comprometido, ordenados por id para que la respuesta no cambie de una petición a otra.
 */
export async function conDisponible<T extends { id: string; stock: number }>(productos: T[], cliente: Cliente = prisma) {
    const ids = productos.map((p) => p.id);
    const [comprometido, niveles] = await Promise.all([
        comprometidoPorAlmacen(ids, cliente),
        ids.length === 0 ? [] : nivelesPorAlmacen(ids, cliente),
    ]);

    const stockPorProducto = new Map<string, Map<string, { stock: number; caducado: number }>>();
    for (const n of niveles) {
        const almacenes = stockPorProducto.get(n.productId) ?? new Map<string, { stock: number; caducado: number }>();
        almacenes.set(n.warehouseId, n);
        stockPorProducto.set(n.productId, almacenes);
    }

    return productos.map((p) => {
        const stock = stockPorProducto.get(p.id) ?? new Map<string, { stock: number; caducado: number }>();
        const comprometidoAqui = comprometido.get(p.id) ?? new Map<string, number>();

        const stockLevels: NivelDeStock[] = [...new Set([...stock.keys(), ...comprometidoAqui.keys()])].sort().map((warehouseId) => {
            const enAlmacen = stock.get(warehouseId) ?? { stock: 0, caducado: 0 };
            const committedStock = comprometidoAqui.get(warehouseId) ?? 0;
            return {
                warehouseId,
                stock: enAlmacen.stock,
                expiredStock: enAlmacen.caducado,
                committedStock,
                availableStock: enAlmacen.stock - enAlmacen.caducado - committedStock,
            };
        });

        const committedStock = stockLevels.reduce((suma, n) => suma + n.committedStock, 0);
        const expiredStock = stockLevels.reduce((suma, n) => suma + n.expiredStock, 0);
        return { ...p, committedStock, expiredStock, availableStock: p.stock - expiredStock - committedStock, stockLevels };
    });
}

/** Lo que hay de cada producto en cada almacén, sumados sus lotes, y cuánto de eso ha caducado. */
async function nivelesPorAlmacen(productIds: string[], cliente: Cliente) {
    const hoy = await hoyDelNegocio();
    return cliente.$queryRaw<Array<{ productId: string; warehouseId: string; stock: number; caducado: number }>>`
        SELECT sl."productId", sl."warehouseId", SUM(sl.stock)::int AS stock,
               COALESCE(SUM(sl.stock) FILTER (WHERE l."expiresAt" < ${hoy}::date), 0)::int AS caducado
        FROM stock_levels sl
        LEFT JOIN lots l ON l.id = sl."lotId"
        WHERE sl."productId" IN (${Prisma.join(productIds)})
        GROUP BY sl."productId", sl."warehouseId"
        HAVING SUM(sl.stock) <> 0`;
}
