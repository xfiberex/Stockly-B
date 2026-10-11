import { prisma } from "@/shared/lib/prisma";
import { $Enums, Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { filtroDeEnum } from "@/shared/lib/enums";
import { dispararAlertaStock, type ProductoEnAlerta } from "@/shared/lib/stockAlerts";
import { aplicar, bloquearProductos, nivelesEn } from "@/shared/lib/stock";
import { almacenDelFiltro, almacenParaOperar } from "@/shared/lib/almacenes";
import type { CreateInventoryCountInput, RecordInventoryCountLinesInput } from "./inventory-counts.validator";

/**
 * T5-07 — conteo físico de inventario.
 *
 * La regla que sostiene todo el módulo: **cada línea guarda el stock que el sistema esperaba al
 * contarla**, y cerrar aplica `contado − esperado` sobre el stock de ese momento. Comparar con el
 * stock al cerrar convertiría cada venta del día en merma; comparar con una foto al abrir
 * obligaría a parar el almacén mientras se cuenta.
 *
 * T5-14 — **se cuenta un almacén.** El esperado de una línea es lo que hay del producto en el
 * almacén de la sesión, y el ajuste del cierre se aplica a ese almacén y a ningún otro. El
 * mismo producto puede estar a la vez en el conteo de dos locales: son dos estanterías.
 */

type Tx = Prisma.TransactionClient;

const FILTROS_DE_LINEA = { pending: "pending", counted: "counted", difference: "difference" } as const;

/** Cerrar un conteo grande actualiza miles de filas: el plazo por defecto (5 s) no alcanza. */
const PLAZO_DE_CIERRE = { timeout: 120_000, maxWait: 10_000 };

const numero = (id: string) => id.slice(0, 8).toUpperCase();

type Resumen = {
    lines: number;
    counted: number;
    uncounted: number;
    withDifference: number;
    unitsOver: number;
    unitsShort: number;
    valueOver: number;
    valueShort: number;
    linesWithoutCost: number;
};

const RESUMEN_VACIO: Resumen = {
    lines: 0, counted: 0, uncounted: 0, withDifference: 0,
    unitsOver: 0, unitsShort: 0, valueOver: 0, valueShort: 0, linesWithoutCost: 0,
};

/**
 * Las cifras de varias sesiones en una consulta. En una cerrada, la diferencia y el coste son
 * los que se aplicaron y se guardaron al cerrar; en una abierta o cancelada, `contado − esperado`
 * al coste medio actual. Céntimos: el valor se redondea al final, no por línea.
 */
async function resumenes(ids: string[]): Promise<Map<string, Resumen>> {
    if (ids.length === 0) return new Map();

    const filas = await prisma.$queryRaw<Array<Resumen & { countId: string }>>`
        SELECT l."countId",
               COUNT(*)::int                                                AS "lines",
               COUNT(l."countedQuantity")::int                              AS "counted",
               (COUNT(*) - COUNT(l."countedQuantity"))::int                 AS "uncounted",
               COUNT(*) FILTER (WHERE l.dif <> 0)::int                      AS "withDifference",
               COALESCE(SUM(l.dif) FILTER (WHERE l.dif > 0), 0)::int        AS "unitsOver",
               COALESCE(-SUM(l.dif) FILTER (WHERE l.dif < 0), 0)::int       AS "unitsShort",
               ROUND(COALESCE(SUM(l.dif * l.coste) FILTER (WHERE l.dif > 0), 0), 2)::float8  AS "valueOver",
               ROUND(COALESCE(-SUM(l.dif * l.coste) FILTER (WHERE l.dif < 0), 0), 2)::float8 AS "valueShort",
               COUNT(*) FILTER (WHERE l.dif <> 0 AND l.coste IS NULL)::int  AS "linesWithoutCost"
        FROM (
            SELECT l."countId", l."countedQuantity",
                   CASE WHEN c.status = 'CLOSED' THEN l.adjustment
                        ELSE l."countedQuantity" - l."expectedQuantity" END AS dif,
                   CASE WHEN c.status = 'CLOSED' THEN l."unitCost" ELSE p."costPrice" END AS coste
            FROM inventory_count_lines l
            JOIN inventory_counts c ON c.id = l."countId"
            JOIN products p ON p.id = l."productId"
            WHERE l."countId" IN (${Prisma.join(ids)})
        ) l
        GROUP BY l."countId"`;

    return new Map(filas.map(({ countId, ...resumen }) => [countId, resumen]));
}

const CONTEO_INCLUDE = {
    category: { select: { id: true, name: true } },
    warehouse: { select: { id: true, name: true } },
} as const;

type ConteoConCategoria = Prisma.InventoryCountGetPayload<{ include: typeof CONTEO_INCLUDE }>;

function conResumen(conteo: ConteoConCategoria, resumen: Resumen | undefined) {
    return {
        id: conteo.id,
        status: conteo.status,
        note: conteo.note,
        warehouse: conteo.warehouse,
        category: conteo.category,
        createdByEmail: conteo.createdByEmail,
        closedByEmail: conteo.closedByEmail,
        createdAt: conteo.createdAt,
        closedAt: conteo.closedAt,
        summary: resumen ?? RESUMEN_VACIO,
    };
}

const LINEA_INCLUDE = {
    product: { select: { name: true, sku: true, category: { select: { name: true } } } },
} as const;

type LineaConProducto = Prisma.InventoryCountLineGetPayload<{ include: typeof LINEA_INCLUDE }>;

function aLinea(linea: LineaConProducto) {
    const contada = linea.countedQuantity !== null && linea.expectedQuantity !== null;
    return {
        id: linea.id,
        productId: linea.productId,
        name: linea.product.name,
        sku: linea.product.sku,
        category: linea.product.category?.name ?? null,
        countedQuantity: linea.countedQuantity,
        expectedQuantity: linea.expectedQuantity,
        difference: contada ? linea.countedQuantity! - linea.expectedQuantity! : null,
        countedAt: linea.countedAt,
        countedByEmail: linea.countedByEmail,
        adjustment: linea.adjustment,
        unitCost: linea.unitCost === null ? null : Number(linea.unitCost),
    };
}

/**
 * Bloquea la sesión hasta el final de la transacción y la devuelve leída **después** del
 * bloqueo. Sin esto, anotar una línea mientras otro cierra podría colarse en una sesión ya
 * cerrada, y dos cierres a la vez aplicarían los ajustes dos veces.
 */
async function bloquearAbierta(tx: Tx, id: string) {
    const filas = await tx.$queryRaw<Array<{ status: $Enums.InventoryCountStatus; warehouseId: string }>>`
        SELECT status, "warehouseId" FROM inventory_counts WHERE id = ${id} FOR UPDATE`;
    if (filas.length === 0) throw new HttpError(404, "Conteo no encontrado", "INVENTORY_COUNT_NOT_FOUND");
    if (filas[0]!.status !== "OPEN") {
        throw new HttpError(400, "El conteo ya está cerrado o cancelado", "COUNT_NOT_OPEN");
    }
    return { warehouseId: filas[0]!.warehouseId };
}

export const inventoryCountsService = {
    async getAll(query: Record<string, string | undefined>) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
        const status = filtroDeEnum($Enums.InventoryCountStatus, query.status, "status");
        const warehouseId = await almacenDelFiltro(query.warehouseId);
        const where = { ...(status && { status }), ...(warehouseId && { warehouseId }) };

        const [conteos, total] = await Promise.all([
            prisma.inventoryCount.findMany({ where, include: CONTEO_INCLUDE, orderBy: { createdAt: "desc" }, skip, take: limit }),
            prisma.inventoryCount.count({ where }),
        ]);
        const cifras = await resumenes(conteos.map((c) => c.id));

        return {
            data: conteos.map((c) => conResumen(c, cifras.get(c.id))),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    async getById(id: string) {
        const conteo = await prisma.inventoryCount.findUnique({ where: { id }, include: CONTEO_INCLUDE });
        if (!conteo) throw new HttpError(404, "Conteo no encontrado", "INVENTORY_COUNT_NOT_FOUND");
        return conResumen(conteo, (await resumenes([id])).get(id));
    },

    /**
     * Abre una sesión con una línea por producto **activo** del filtro, sin contar. Un producto
     * no puede estar en dos sesiones abiertas **del mismo almacén**: la segunda anotaría otra
     * cifra para la misma estantería y el segundo cierre ajustaría otra vez lo que el primero
     * ya corrigió.
     */
    async create(dto: CreateInventoryCountInput, email: string | undefined) {
        const categoryId = dto.categoryId ?? null;

        const id = await prisma.$transaction(async (tx) => {
            // Dos aperturas a la vez podrían comprobar el solape antes de que la otra escriba
            // sus líneas. El bloqueo consultivo las pone en fila; se suelta al terminar.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventory_counts:apertura'))`;

            if (categoryId && !(await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
                throw new HttpError(404, "Categoría no encontrada", "CATEGORY_NOT_FOUND");
            }
            const almacen = await almacenParaOperar(dto.warehouseId, tx);

            const filtro = categoryId === null ? Prisma.empty : Prisma.sql`AND p."categoryId" = ${categoryId}`;

            const [{ enOtra }] = await tx.$queryRaw<Array<{ enOtra: number }>>`
                SELECT COUNT(DISTINCT l."productId")::int AS "enOtra"
                FROM inventory_count_lines l
                JOIN inventory_counts c ON c.id = l."countId" AND c.status = 'OPEN' AND c."warehouseId" = ${almacen.id}
                JOIN products p ON p.id = l."productId"
                WHERE p."isActive" ${filtro}`;
            if (enOtra > 0) {
                throw new HttpError(
                    409,
                    `${enOtra} productos de este filtro ya están en otro conteo abierto. Ciérralo o cancélalo antes.`,
                    "PRODUCTS_IN_OPEN_COUNT",
                    { productos: enOtra },
                );
            }

            const conteo = await tx.inventoryCount.create({
                data: { warehouseId: almacen.id, categoryId, note: dto.note || null, createdByEmail: email ?? null },
            });
            // Una sentencia y no un `createMany` con los ids leídos antes: el catálogo entero son
            // 100 000 filas, y así no pasan por Node.
            const lineas = await tx.$executeRaw`
                INSERT INTO inventory_count_lines (id, "countId", "productId")
                SELECT gen_random_uuid()::text, ${conteo.id}, p.id
                FROM products p
                WHERE p."isActive" ${filtro}`;
            if (lineas === 0) {
                throw new HttpError(400, "No hay productos activos que contar con ese filtro", "COUNT_WITHOUT_PRODUCTS");
            }
            return conteo.id;
        }, PLAZO_DE_CIERRE);

        return inventoryCountsService.getById(id);
    },

    async getLines(id: string, query: Record<string, string | undefined>) {
        const conteo = await prisma.inventoryCount.findUnique({ where: { id }, select: { status: true } });
        if (!conteo) throw new HttpError(404, "Conteo no encontrado", "INVENTORY_COUNT_NOT_FOUND");

        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
        const filtro = filtroDeEnum(FILTROS_DE_LINEA, query.filter, "filter");
        const busqueda = query.search?.trim();

        const where: Prisma.InventoryCountLineWhereInput = {
            countId: id,
            ...(filtro === "pending" && { countedQuantity: null }),
            ...(filtro === "counted" && { countedQuantity: { not: null } }),
            ...(filtro === "difference" && {
                countedQuantity: { not: null },
                NOT: { countedQuantity: { equals: prisma.inventoryCountLine.fields.expectedQuantity } },
            }),
            // T5-08 — la línea de un producto concreto: la del que se acaba de escanear.
            ...(query.productId && { productId: query.productId }),
            ...(busqueda && {
                product: {
                    OR: [
                        { name: { contains: busqueda, mode: "insensitive" as const } },
                        { sku: { contains: busqueda, mode: "insensitive" as const } },
                        // Exacto, como la búsqueda por código: un código a medias no identifica nada.
                        { barcode: busqueda },
                    ],
                },
            }),
        };

        const [lineas, total] = await Promise.all([
            prisma.inventoryCountLine.findMany({
                where,
                include: LINEA_INCLUDE,
                orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
                skip,
                take: limit,
            }),
            prisma.inventoryCountLine.count({ where }),
        ]);

        return {
            data: lineas.map(aLinea),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    /**
     * Anota lo contado. El esperado se lee **ahora**, en la misma transacción que escribe la
     * cifra: es el stock —el del almacén de la sesión— contra el que se comparará al cerrar.
     * Volver a contar sobrescribe los dos.
     */
    async recordLines(id: string, dto: RecordInventoryCountLinesInput, email: string | undefined) {
        const productIds = dto.items.map((i) => i.productId);

        const lineas = await prisma.$transaction(async (tx) => {
            const { warehouseId } = await bloquearAbierta(tx, id);

            const existentes = await tx.inventoryCountLine.findMany({
                where: { countId: id, productId: { in: productIds } },
                select: { id: true, productId: true },
            });
            if (existentes.length !== productIds.length) {
                const faltan = productIds.length - existentes.length;
                throw new HttpError(
                    400,
                    `${faltan} de los productos enviados no están en este conteo`,
                    "PRODUCT_NOT_IN_COUNT",
                    { productos: faltan },
                );
            }

            // Sin fila es cero: el producto nunca ha estado en este almacén.
            const stock = await nivelesEn(tx, warehouseId, productIds);
            const ahora = new Date();
            const lineaDe = new Map(existentes.map((l) => [l.productId, l.id]));

            await Promise.all(
                dto.items.map((item) =>
                    tx.inventoryCountLine.update({
                        where: { id: lineaDe.get(item.productId)! },
                        data: {
                            countedQuantity: item.countedQuantity,
                            expectedQuantity: stock.get(item.productId) ?? 0,
                            countedAt: ahora,
                            countedByEmail: email ?? null,
                        },
                    }),
                ),
            );

            return tx.inventoryCountLine.findMany({
                where: { id: { in: existentes.map((l) => l.id) } },
                include: LINEA_INCLUDE,
                orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
            });
        });

        return lineas.map(aLinea);
    },

    /**
     * Cierra: cada línea contada con diferencia es un `ADJUSTMENT` de `contado − esperado` sobre
     * el stock actual **del almacén de la sesión**, **todos o ninguno**. Las no contadas no se tocan. Si un ajuste dejara un
     * producto en negativo —se contaron 8 de 10 y después se vendieron 9—, no se cierra nada: ese
     * producto hay que volver a contarlo.
     */
    async close(id: string, email: string | undefined) {
        const { ajustes, sinContar, alertas } = await prisma.$transaction(async (tx) => {
            const { warehouseId } = await bloquearAbierta(tx, id);

            const contadas = await tx.inventoryCountLine.findMany({
                where: { countId: id, countedQuantity: { not: null } },
                select: { productId: true, countedQuantity: true, expectedQuantity: true },
            });
            const sinContar = await tx.inventoryCountLine.count({ where: { countId: id, countedQuantity: null } });
            const conDiferencia = contadas
                .map((l) => ({ productId: l.productId, delta: l.countedQuantity! - l.expectedQuantity! }))
                .filter((l) => l.delta !== 0);

            const alertas: ProductoEnAlerta[] = [];

            if (conDiferencia.length > 0) {
                // En orden de id, como cualquier otro bloqueo de varios productos: dos cierres que
                // compartan productos los piden en el mismo orden y no se bloquean en cruz.
                const ids = conDiferencia.map((l) => l.productId).sort();
                await bloquearProductos(tx, ids);
                const enAlmacen = await nivelesEn(tx, warehouseId, ids);

                const negativos = conDiferencia.filter((l) => (enAlmacen.get(l.productId) ?? 0) + l.delta < 0);
                if (negativos.length > 0) {
                    const primero = await tx.product.findUniqueOrThrow({ where: { id: negativos[0]!.productId }, select: { name: true } });
                    throw new HttpError(
                        409,
                        `Cerrar dejaría ${negativos.length} productos en negativo (${primero.name}, …): ` +
                            "han salido unidades después de contarlos. Vuelve a contarlos.",
                        "COUNT_ADJUSTMENT_NEGATIVE",
                        { productos: negativos.length, producto: primero.name },
                    );
                }

                const nota = `Conteo #${numero(id)}`;
                const porProducto = new Map(conDiferencia.map((l) => [l.productId, l.delta]));
                for (const productId of ids) {
                    const delta = porProducto.get(productId)!;
                    const movido = await aplicar(tx, { productId, warehouseId, type: "ADJUSTMENT", note: nota }, delta);
                    // El mínimo es del producto entero: se compara con el total, no con este almacén.
                    if (delta < 0) alertas.push({ id: productId, name: movido.name, stock: movido.stock, minStock: movido.minStock });
                }
            }

            // Lo aplicado y el coste de este momento, para que el informe de una sesión cerrada no
            // cambie cuando cambie el coste medio.
            await tx.$executeRaw`
                UPDATE inventory_count_lines l
                SET adjustment = l."countedQuantity" - l."expectedQuantity", "unitCost" = p."costPrice"
                FROM products p
                WHERE p.id = l."productId" AND l."countId" = ${id} AND l."countedQuantity" IS NOT NULL`;
            await tx.inventoryCount.update({
                where: { id },
                data: { status: "CLOSED", closedAt: new Date(), closedByEmail: email ?? null },
            });

            return { ajustes: conDiferencia.length, sinContar, alertas };
        }, PLAZO_DE_CIERRE);

        // Fuera de la transacción: el correo no puede deshacer un cierre ya guardado.
        for (const a of alertas) dispararAlertaStock(a);

        return { conteo: await inventoryCountsService.getById(id), ajustes, sinContar };
    },

    /** Cancelar no mueve nada: las cifras anotadas se conservan para consulta. */
    async cancel(id: string, email: string | undefined) {
        await prisma.$transaction(async (tx) => {
            await bloquearAbierta(tx, id);
            await tx.inventoryCount.update({
                where: { id },
                data: { status: "CANCELLED", closedAt: new Date(), closedByEmail: email ?? null },
            });
        });
        return inventoryCountsService.getById(id);
    },
};
