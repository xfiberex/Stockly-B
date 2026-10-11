import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { bloquearProductos, nivelesEn, transferir } from "@/shared/lib/stock";
import { comprometidoPorProducto } from "@/shared/lib/stockComprometido";
import { almacenDelFiltro, almacenParaOperar } from "@/shared/lib/almacenes";
import { hoyDelNegocio } from "@/shared/lib/lotes";
import type { CreateStockTransferInput } from "./stock-transfers.validator";
import { lineasDe } from "./stock-transfers.lineas";

/**
 * T5-14 — transferencias entre almacenes.
 *
 * Una transferencia es **una salida y una entrada en la misma transacción**: no hay estado
 * «en tránsito» ni recepción aparte. Lo que sale de un almacén está en el otro en el mismo
 * instante, y el total del producto no se mueve. Sus líneas no son una tabla: son los
 * movimientos `TRANSFER` que apuntan a ella, dos por producto.
 */

const TRANSFERENCIA_INCLUDE = {
    fromWarehouse: { select: { id: true, name: true } },
    toWarehouse: { select: { id: true, name: true } },
} as const;

type TransferenciaConAlmacenes = Prisma.StockTransferGetPayload<{ include: typeof TRANSFERENCIA_INCLUDE }>;

const numero = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * Cuántos productos y cuántas unidades llevó cada una. Se cuentan las entradas, y **productos
 * distintos**: desde T5-15, uno que viajó en dos lotes son dos entradas.
 */
async function cifras(ids: string[]): Promise<Map<string, { lines: number; units: number }>> {
    if (ids.length === 0) return new Map();
    const filas = await prisma.$queryRaw<Array<{ transferId: string; lines: number; units: number }>>`
        SELECT "transferId", COUNT(DISTINCT "productId")::int AS lines, SUM(delta)::int AS units
        FROM stock_movements
        WHERE "transferId" IN (${Prisma.join(ids)}) AND delta > 0
        GROUP BY "transferId"`;
    return new Map(filas.map((f) => [f.transferId, { lines: f.lines, units: f.units }]));
}

function aTransferencia(t: TransferenciaConAlmacenes, c: { lines: number; units: number } | undefined) {
    return {
        id: t.id,
        fromWarehouse: t.fromWarehouse,
        toWarehouse: t.toWarehouse,
        note: t.note,
        createdByEmail: t.createdByEmail,
        createdAt: t.createdAt,
        lines: c?.lines ?? 0,
        units: c?.units ?? 0,
    };
}

export const stockTransfersService = {
    /** De la más reciente a la más antigua. `warehouseId` trae las que salen de él **o** entran en él. */
    async getAll(query: { page?: string; limit?: string; warehouseId?: unknown }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
        const warehouseId = await almacenDelFiltro(query.warehouseId);
        const where = warehouseId ? { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] } : {};

        const [transferencias, total] = await prisma.$transaction([
            prisma.stockTransfer.findMany({
                where,
                include: TRANSFERENCIA_INCLUDE,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip,
                take: limit,
            }),
            prisma.stockTransfer.count({ where }),
        ]);
        const porId = await cifras(transferencias.map((t) => t.id));

        return {
            data: transferencias.map((t) => aTransferencia(t, porId.get(t.id))),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    /** Una transferencia con sus líneas: por producto, lo que se movió y lo que quedó en cada extremo. */
    async getById(id: string) {
        const transferencia = await prisma.stockTransfer.findUnique({ where: { id }, include: TRANSFERENCIA_INCLUDE });
        if (!transferencia) throw new HttpError(404, "Transferencia no encontrada", "STOCK_TRANSFER_NOT_FOUND");

        // Como mucho `MAXIMO_DE_LINEAS_DE_TRANSFERENCIA` × 2: el tope lo pone el validador al crearla.
        const movimientos = await prisma.stockMovement.findMany({
            where: { transferId: id },
            include: { product: { select: { name: true, sku: true } } },
            orderBy: [{ product: { name: "asc" } }, { productId: "asc" }],
        });

        const items = lineasDe(movimientos);

        return {
            ...aTransferencia(transferencia, { lines: items.length, units: items.reduce((suma, i) => suma + i.quantity, 0) }),
            items,
        };
    },

    /**
     * Mueve mercancía de un almacén a otro. **Todo o nada**: si de un solo producto no hay
     * bastante, no se mueve ninguno.
     *
     * Lo que se puede transferir es lo **disponible** en el origen —lo que hay menos lo
     * comprometido en sus ventas pendientes—, no todo lo que hay: llevarse a otro local unas
     * unidades ya prometidas a un cliente de este dejaría esa venta sin poder enviarse. Una
     * salida a mano no mira eso, porque cuenta algo que ya pasó; una transferencia se decide.
     *
     * T5-15 — y **lo caducado no viaja**: no está disponible para venderse aquí ni allí, y lo
     * que toca es darlo de baja donde está. Lo que sí viaja conserva su lote.
     */
    async create(dto: CreateStockTransferInput, email: string | undefined) {
        if (dto.fromWarehouseId === dto.toWarehouseId) {
            throw new HttpError(400, "El origen y el destino son el mismo almacén", "TRANSFER_SAME_WAREHOUSE");
        }
        const [origen, destino] = await Promise.all([
            almacenParaOperar(dto.fromWarehouseId),
            almacenParaOperar(dto.toWarehouseId),
        ]);

        const ids = dto.items.map((i) => i.productId).sort();
        const pedido = new Map(dto.items.map((i) => [i.productId, i.quantity]));
        const hoy = await hoyDelNegocio();

        const id = await prisma.$transaction(async (tx) => {
            await bloquearProductos(tx, ids);

            const productos = new Map(
                (await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((p) => [p.id, p]),
            );
            const enOrigen = await nivelesEn(tx, origen.id, ids, { vigentesA: hoy });
            const comprometido = await comprometidoPorProducto(ids, tx, origen.id);

            const sinDisponible = (producto: string, disponible: number, requerido: number) =>
                new HttpError(
                    409,
                    `No hay suficiente disponible de "${producto}" en «${origen.name}». Disponible: ${Math.max(disponible, 0)}, requerido: ${requerido}`,
                    "INSUFFICIENT_AVAILABLE_STOCK",
                    { producto, disponible: Math.max(disponible, 0), requerido },
                );

            for (const productId of ids) {
                const producto = productos.get(productId);
                if (!producto) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

                const disponible = (enOrigen.get(productId) ?? 0) - (comprometido.get(productId) ?? 0);
                if (pedido.get(productId)! > disponible) throw sinDisponible(producto.name, disponible, pedido.get(productId)!);
            }

            const transferencia = await tx.stockTransfer.create({
                data: {
                    fromWarehouseId: origen.id,
                    toWarehouseId: destino.id,
                    note: dto.note || null,
                    createdByEmail: email ?? null,
                },
            });

            for (const productId of ids) {
                const cantidad = pedido.get(productId)!;
                await transferir(
                    tx,
                    {
                        productId,
                        fromWarehouseId: origen.id,
                        toWarehouseId: destino.id,
                        cantidad,
                        transferId: transferencia.id,
                        vigentesA: hoy,
                        note: `Transferencia #${numero(transferencia.id)}: ${origen.name} → ${destino.name}`,
                    },
                    (enAlmacen) => sinDisponible(productos.get(productId)!.name, enAlmacen, cantidad),
                );
            }

            return transferencia.id;
        });

        return stockTransfersService.getById(id);
    },
};
