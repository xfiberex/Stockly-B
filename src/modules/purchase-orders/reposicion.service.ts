import { almacenParaOperar } from "@/shared/lib/almacenes";
import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { settingsService } from "@/modules/settings/settings.service";
import type { GenerarDesdeSugerenciasDto } from "./purchase-orders.types";

/**
 * T5-05 — la ventana de la que sale la velocidad de salida. La misma que la rotación del
 * dashboard (`reports.service.ts`): si la sugerencia y la tabla de «reponer pronto» miraran
 * meses distintos, podrían contradecirse sobre el mismo producto.
 */
export const DIAS_DE_VELOCIDAD = 30;

/**
 * Una fila por producto activo con todo lo que entra en la fórmula, y el **numerador** de la
 * sugerencia ya calculado en enteros:
 *
 *     sugerida = ⌈ salidas / 30 × plazo + mínimo − disponible − pendiente ⌉
 *              = ⌈ (salidas × plazo + 30 × (mínimo − disponible − pendiente)) / 30 ⌉
 *
 * **En enteros y no en coma flotante, a propósito.** La forma de la ficha multiplica una
 * velocidad fraccionaria (7 salidas / 30 días = 0.2333…) por el plazo, y un redondeo hacia
 * arriba sobre un 19.000000000000004 da 20. Con el numerador entero la división por 30 es la
 * única operación inexacta, y el techo se hace en `bigint` sin decimales de por medio.
 *
 * Lo pendiente de recibir es `quantity − receivedQuantity` de las órdenes abiertas (T5-04),
 * **de cualquier proveedor**: lo que ya viene de camino cubre la necesidad venga de quien
 * venga. Las salidas son los movimientos `OUT`, igual que en la rotación.
 */
function consultaBase(plazoPorDefecto: number) {
    return Prisma.sql`
        WITH salidas AS (
            SELECT sm."productId", SUM(ABS(sm.delta)) AS unidades
            FROM stock_movements sm
            WHERE sm.type = 'OUT' AND sm."createdAt" >= NOW() - make_interval(days => ${DIAS_DE_VELOCIDAD})
            GROUP BY sm."productId"
        ),
        comprometido AS (
            SELECT soi."productId", SUM(soi.quantity) AS unidades
            FROM sale_order_items soi
            JOIN sale_orders so ON so.id = soi."saleOrderId"
            WHERE so.status = 'PENDING' AND soi."productId" IS NOT NULL
            GROUP BY soi."productId"
        ),
        pendiente AS (
            SELECT poi."productId", SUM(poi.quantity - poi."receivedQuantity") AS unidades
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi."purchaseOrderId"
            WHERE po.status IN ('PENDING', 'PARTIALLY_RECEIVED') AND poi."productId" IS NOT NULL
            GROUP BY poi."productId"
        ),
        calculo AS (
            SELECT
                p.id, p.name, p.sku, p.stock, p."minStock", p."costPrice", p."supplierId",
                s.name AS "supplierName",
                s."leadTimeDays" IS NULL AS "plazoPorDefecto",
                COALESCE(s."leadTimeDays", ${plazoPorDefecto})::bigint AS plazo,
                COALESCE(sa.unidades, 0)::bigint AS salidas,
                COALESCE(c.unidades, 0)::bigint AS comprometido,
                COALESCE(pe.unidades, 0)::bigint AS pendiente
            FROM products p
            LEFT JOIN suppliers s ON s.id = p."supplierId"
            LEFT JOIN salidas sa ON sa."productId" = p.id
            LEFT JOIN comprometido c ON c."productId" = p.id
            LEFT JOIN pendiente pe ON pe."productId" = p.id
            WHERE p."isActive" = true
        ),
        sugerencias AS (
            SELECT *,
                salidas * plazo + ${DIAS_DE_VELOCIDAD} * ("minStock" - (stock - comprometido) - pendiente) AS numerador
            FROM calculo
        )
    `;
}

type FilaDeSugerencia = {
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    minStock: number;
    costPrice: Prisma.Decimal | null;
    supplierId: string | null;
    supplierName: string | null;
    plazoPorDefecto: boolean;
    plazo: bigint;
    salidas: bigint;
    comprometido: bigint;
    pendiente: bigint;
    sugerida: bigint;
    ultimoPrecio: Prisma.Decimal | null;
};

/**
 * El precio que se propone para el borrador (decisión de la ficha): el último pagado **a ese
 * proveedor** por ese producto; si no hay, el coste medio (T5-01); si tampoco, ninguno, y la
 * pantalla obliga a escribirlo.
 *
 * **Nunca el precio de venta**, que es a lo que cae hoy el formulario de compra a mano: lo que
 * se deje en la línea es lo que la primera recepción fijará como coste (la trampa que anotó
 * T5-01), y un borrador generado se revisa menos que una orden escrita a mano.
 */
function precioPropuesto(fila: FilaDeSugerencia) {
    if (fila.ultimoPrecio !== null) return { proposedUnitPrice: Number(fila.ultimoPrecio), priceSource: "LAST_PURCHASE" as const };
    if (fila.costPrice !== null) {
        // El coste lleva cuatro decimales y la línea de la orden dos: se redondea aquí para que
        // lo que se ve en la pantalla sea lo que se guarda.
        return { proposedUnitPrice: Math.round(Number(fila.costPrice) * 100) / 100, priceSource: "COST" as const };
    }
    return { proposedUnitPrice: null, priceSource: null };
}

export const reposicionService = {
    /**
     * `GET /purchase-orders/suggestions` — los productos activos a los que la fórmula les pide
     * reponer, paginados (T4-15). **Los que no tienen proveedor salen**, en su propio grupo al
     * final, en vez de descartarse: el problema de reposición existe igual, y esconderlo sería
     * justo lo que la ficha prohíbe. La interfaz no deja marcarlos para generar.
     */
    async listar(query: { page?: string; limit?: string } = {}) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 25 });
        const plazoPorDefecto = Number(await settingsService.get("defaultLeadTimeDays"));
        const base = consultaBase(plazoPorDefecto);

        const [filas, recuento] = await Promise.all([
            prisma.$queryRaw<FilaDeSugerencia[]>`
                ${base}
                SELECT g.*, ult."unitPrice" AS "ultimoPrecio"
                FROM (
                    SELECT *, (numerador + ${DIAS_DE_VELOCIDAD - 1}) / ${DIAS_DE_VELOCIDAD} AS sugerida
                    FROM sugerencias
                    WHERE numerador > 0
                    -- Agrupado por proveedor, con los que no tienen al final, y desempate por
                    -- \`id\` para que la paginación no baraje filas con el mismo nombre.
                    ORDER BY "supplierName" ASC NULLS LAST, "supplierId", name ASC, id
                    LIMIT ${limit} OFFSET ${skip}
                ) g
                LEFT JOIN LATERAL (
                    SELECT poi."unitPrice"
                    FROM purchase_order_items poi
                    JOIN purchase_orders po ON po.id = poi."purchaseOrderId"
                    WHERE poi."productId" = g.id
                      AND po."supplierId" = g."supplierId"
                      AND po.status IN ('RECEIVED', 'PARTIALLY_RECEIVED')
                      AND poi."receivedQuantity" > 0
                    ORDER BY po."createdAt" DESC, poi."createdAt" DESC, poi.id DESC
                    LIMIT 1
                ) ult ON true
                ORDER BY g."supplierName" ASC NULLS LAST, g."supplierId", g.name ASC, g.id
            `,
            prisma.$queryRaw<Array<{ total: bigint }>>`
                ${base}
                SELECT COUNT(*) AS total FROM sugerencias WHERE numerador > 0
            `,
        ]);

        const total = Number(recuento[0]?.total ?? 0);

        return {
            data: filas.map((f) => {
                const comprometido = Number(f.comprometido);
                const salidas = Number(f.salidas);
                return {
                    productId: f.id,
                    productName: f.name,
                    sku: f.sku,
                    supplier: f.supplierId && f.supplierName ? { id: f.supplierId, name: f.supplierName } : null,
                    leadTimeDays: Number(f.plazo),
                    leadTimeIsDefault: f.plazoPorDefecto,
                    stock: f.stock,
                    committedStock: comprometido,
                    availableStock: f.stock - comprometido,
                    minStock: f.minStock,
                    pendingReceipt: Number(f.pendiente),
                    unitsOut: salidas,
                    dailyVelocity: Math.round((salidas / DIAS_DE_VELOCIDAD) * 100) / 100,
                    suggestedQuantity: Number(f.sugerida),
                    ...precioPropuesto(f),
                };
            }),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            days: DIAS_DE_VELOCIDAD,
            defaultLeadTimeDays: plazoPorDefecto,
        };
    },

    /**
     * `POST /purchase-orders/suggestions` — crea **una orden `PENDING` por proveedor** con las
     * líneas revisadas en la pantalla. Cantidad y precio son los que manda quien revisa, no los
     * sugeridos: la sugerencia es un punto de partida, y pedir de más o de menos es decisión
     * suya. Todas las órdenes o ninguna, en una sola transacción.
     *
     * No mueve stock: un borrador pendiente solo cuenta como «pendiente de recibir», y por eso
     * volver a pedir sugerencias justo después ya no propone lo que se acaba de pedir.
     */
    async generar(dto: GenerarDesdeSugerenciasDto) {
        // T5-14 — la sugerencia es del producto, no de un local: el mínimo es global. A qué
        // almacén se pide lo decide quien genera las órdenes.
        const almacen = await almacenParaOperar(dto.warehouseId);
        const ids = dto.items.map((i) => i.productId);
        const productos = await prisma.product.findMany({
            where: { id: { in: ids }, isActive: true },
            select: { id: true, name: true, supplierId: true, supplier: { select: { name: true } } },
        });
        const porId = new Map(productos.map((p) => [p.id, p]));

        const lineas = dto.items.map((linea) => {
            const producto = porId.get(linea.productId);
            if (!producto) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
            if (!producto.supplierId) {
                throw new HttpError(
                    400,
                    `"${producto.name}" no tiene proveedor: no se puede generar su orden de compra`,
                    "PRODUCT_WITHOUT_SUPPLIER",
                    { producto: producto.name },
                );
            }
            return { ...linea, producto, supplierId: producto.supplierId };
        });

        const porProveedor = new Map<string, typeof lineas>();
        for (const linea of lineas) {
            porProveedor.set(linea.supplierId, [...(porProveedor.get(linea.supplierId) ?? []), linea]);
        }

        // Por nombre de proveedor, para que la respuesta —y la auditoría— salgan en un orden
        // estable y no en el de llegada de las líneas.
        const grupos = [...porProveedor.entries()].sort(([, a], [, b]) =>
            (a[0]!.producto.supplier?.name ?? "").localeCompare(b[0]!.producto.supplier?.name ?? ""),
        );

        return prisma.$transaction(
            grupos.map(([supplierId, grupo]) =>
                prisma.purchaseOrder.create({
                    data: {
                        supplierId,
                        warehouseId: almacen.id,
                        items: {
                            create: grupo.map((linea) => ({
                                productId: linea.productId,
                                productName: linea.producto.name,
                                quantity: linea.quantity,
                                unitPrice: linea.unitPrice,
                            })),
                        },
                    },
                    include: {
                        supplier: { select: { id: true, name: true } },
                        warehouse: { select: { id: true, name: true } },
                        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
                    },
                }),
            ),
        );
    },
};
