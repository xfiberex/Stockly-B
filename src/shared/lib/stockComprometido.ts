import { prisma } from "@/shared/lib/prisma";

/** El cliente de Prisma o el de una transacción: los dos sirven para leer. */
type Cliente = Pick<typeof prisma, "saleOrderItem">;

/**
 * T5-03 — unidades comprometidas por producto: las pedidas en ventas **pendientes**.
 *
 * Una venta pendiente no descuenta stock —eso lo hace el envío—, pero ya está prometida a un
 * cliente. Sin restarla, el catálogo enseñaba como vendible lo que ya estaba vendido, y el
 * problema aparecía al enviar la segunda venta de las mismas unidades.
 *
 * Solo cuentan los ítems ligados a un producto; los escritos a mano no tienen stock que
 * comprometer. Un producto sin ventas pendientes no aparece en el mapa: su comprometido es 0.
 */
export async function comprometidoPorProducto(productIds: string[], cliente: Cliente = prisma): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const filas = await cliente.saleOrderItem.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, saleOrder: { status: "PENDING" } },
        _sum: { quantity: true },
    });

    return new Map(filas.flatMap((f) => (f.productId ? [[f.productId, f._sum.quantity ?? 0] as const] : [])));
}

/**
 * Añade a cada producto su comprometido y su disponible (\`stock − comprometido\`).
 *
 * **El disponible puede salir negativo** y no se recorta a cero: con datos anteriores a T5-03
 * puede haber más vendido en pendiente que stock, y esconderlo detrás de un 0 taparía
 * justamente lo que hay que ver. Desde T5-03 no se puede llegar ahí creando ventas.
 */
export async function conDisponible<T extends { id: string; stock: number }>(productos: T[], cliente: Cliente = prisma) {
    const comprometido = await comprometidoPorProducto(productos.map((p) => p.id), cliente);
    return productos.map((p) => {
        const committedStock = comprometido.get(p.id) ?? 0;
        return { ...p, committedStock, availableStock: p.stock - committedStock };
    });
}
