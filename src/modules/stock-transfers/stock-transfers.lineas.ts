interface MovimientoDeTransferencia {
    productId: string;
    delta: number;
    warehouseStockAfter: number;
    product: { name: string; sku: string | null };
}

/**
 * Las líneas de una transferencia, a partir de sus movimientos: una por producto.
 *
 * T5-15 — un producto que viajó en dos lotes son dos pares de movimientos, y sigue siendo
 * **una** línea: se suma lo movido, y lo que quedó en cada extremo es lo que dice el último de
 * sus movimientos allí —el que menos deja en el origen y el que más deja en el destino—. Se
 * calcula así, y no leyendo «el último», porque todos se escriben en el mismo instante y la
 * base no promete devolverlos en el orden en que se hicieron.
 */
export function lineasDe(movimientos: MovimientoDeTransferencia[]) {
    const porProducto = new Map<string, { productId: string; name: string; sku: string | null; quantity: number; fromStockAfter: number; toStockAfter: number }>();
    for (const m of movimientos) {
        const linea = porProducto.get(m.productId) ?? {
            productId: m.productId,
            name: m.product.name,
            sku: m.product.sku,
            quantity: 0,
            fromStockAfter: Number.POSITIVE_INFINITY,
            toStockAfter: 0,
        };
        if (m.delta > 0) {
            linea.quantity += m.delta;
            linea.toStockAfter = Math.max(linea.toStockAfter, m.warehouseStockAfter);
        } else {
            linea.fromStockAfter = Math.min(linea.fromStockAfter, m.warehouseStockAfter);
        }
        porProducto.set(m.productId, linea);
    }
    return [...porProducto.values()].map((l) => ({
        ...l,
        fromStockAfter: Number.isFinite(l.fromStockAfter) ? l.fromStockAfter : 0,
    }));
}
