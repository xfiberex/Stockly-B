import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import { dispararAlertaStock } from "@/shared/lib/stockAlerts";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import type {
    CreateProductDto,
    UpdateProductDto,
    ProductQuery,
    ImportProductDto,
    StockMovementType,
    CreateManualMovementDto,
    BulkStockDto,
} from "@/modules/products/product.types";

const PRODUCT_INCLUDE = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
    tags: { select: { id: true, name: true, color: true } },
} as const;

// T2-05 — columnas y forma de fila de la exportación del catálogo. Salen del servicio
// para que el generador por lotes y su mapeo no se dupliquen.
const PRODUCT_EXPORT_SELECT = {
    id: true,
    name: true,
    description: true,
    sku: true,
    price: true,
    stock: true,
    minStock: true,
    isActive: true,
    category: { select: { name: true } },
    brand: { select: { name: true } },
    supplier: { select: { name: true } },
    tags: { select: { name: true } },
} as const;

type ProductoExportado = {
    name: string;
    description: string | null;
    sku: string | null;
    price: unknown;
    stock: number;
    minStock: number;
    isActive: boolean;
    category: { name: string } | null;
    brand: { name: string } | null;
    supplier: { name: string } | null;
    tags: Array<{ name: string }>;
};

/** `id` se pide para el cursor, pero no sale en el archivo: las columnas no cambian. */
function filaDeExportacion(p: ProductoExportado) {
    return {
        name: p.name,
        description: p.description,
        sku: p.sku,
        price: p.price,
        stock: p.stock,
        minStock: p.minStock,
        isActive: p.isActive,
        categoryName: p.category?.name ?? null,
        brandName: p.brand?.name ?? null,
        supplierName: p.supplier?.name ?? null,
        tags: p.tags.map((t) => t.name).join(";"),
    };
}

async function recordMovement(
    productId: string,
    type: StockMovementType,
    delta: number,
    stockAfter: number,
    note?: string,
) {
    if (delta === 0) return;
    await prisma.stockMovement.create({
        data: { productId, type, delta, stockAfter, note },
    });
}

export const productService = {
    async getProducts(query: ProductQuery) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });

        const isActiveFilter =
            query.isActive === "false" ? false
            : query.isActive === "true" ? true
            : undefined;

        const where = {
            ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
            ...(query.search && { name: { contains: query.search, mode: "insensitive" as const } }),
            ...(query.categoryId && { categoryId: query.categoryId }),
            ...(query.brandId && { brandId: query.brandId }),
            ...(query.supplierId && { supplierId: query.supplierId }),
            ...(query.tagId && { tags: { some: { id: query.tagId } } }),
        };

        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: PRODUCT_INCLUDE }),
            prisma.product.count({ where }),
        ]);

        return {
            data: products,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    async getById(id: string) {
        const product = await prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
        if (!product) throw new HttpError(404, "Producto no encontrado");
        return product;
    },

    async create(dto: CreateProductDto, file?: Express.Multer.File) {
        let imageUrl: string | undefined;
        let imagePublicId: string | undefined;

        if (file) {
            const uploaded = await uploadToCloudinary(file.buffer, "stockly/products");
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        }

        const stock = dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0;
        const minStock = dto.minStock !== undefined ? parseInt(String(dto.minStock), 10) : 0;

        const product = await prisma.product.create({
            data: {
                name: dto.name,
                description: dto.description,
                sku: dto.sku || null,
                price: dto.price !== undefined ? parseFloat(String(dto.price)) : 0,
                stock,
                minStock,
                categoryId: dto.categoryId ?? null,
                brandId: dto.brandId ?? null,
                supplierId: dto.supplierId ?? null,
                imageUrl,
                imagePublicId,
                ...(dto.tagIds?.length && { tags: { connect: dto.tagIds.map((id) => ({ id })) } }),
            },
            include: PRODUCT_INCLUDE,
        });

        await recordMovement(product.id, "IN", stock, stock, "Stock inicial");

        return product;
    },

    async update(id: string, dto: UpdateProductDto, file?: Express.Multer.File) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado");

        let imageUrl: string | null | undefined = existing.imageUrl;
        let imagePublicId: string | null | undefined = existing.imagePublicId;

        if (file) {
            if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);
            const uploaded = await uploadToCloudinary(file.buffer, "stockly/products");
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        } else if (String(dto.removeImage) === "true") {
            if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);
            imageUrl = null;
            imagePublicId = null;
        }

        const newPrice = dto.price !== undefined ? parseFloat(String(dto.price)) : undefined;
        const existingPrice = parseFloat(String(existing.price));
        const priceChanged = newPrice !== undefined && newPrice !== existingPrice;

        const tagsUpdate = dto.tagIds !== undefined
            ? { tags: { set: dto.tagIds.map((tid) => ({ id: tid })) } }
            : {};

        const hasStockChange = dto.stock !== undefined;
        const newStock = hasStockChange ? parseInt(String(dto.stock), 10) : undefined;
        const stockDelta = hasStockChange ? newStock! - existing.stock : 0;

        // Producto, historial de precio y movimiento de stock se escriben en una sola
        // transacción para que nunca queden inconsistentes entre sí.
        const updated = await prisma.$transaction(async (tx) => {
            const product = await tx.product.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.sku !== undefined && { sku: dto.sku || null }),
                    ...(newPrice !== undefined && { price: newPrice }),
                    ...(hasStockChange && { stock: newStock }),
                    ...(dto.minStock !== undefined && { minStock: parseInt(String(dto.minStock), 10) }),
                    ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
                    ...(dto.brandId !== undefined && { brandId: dto.brandId }),
                    ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                    imageUrl,
                    imagePublicId,
                    ...tagsUpdate,
                },
                include: PRODUCT_INCLUDE,
            });

            if (priceChanged) {
                await tx.priceHistory.create({
                    data: { productId: id, oldPrice: existingPrice, newPrice: newPrice! },
                });
            }

            if (hasStockChange && stockDelta !== 0) {
                await tx.stockMovement.create({
                    data: {
                        productId: id,
                        type: stockDelta >= 0 ? "IN" : "OUT",
                        delta: stockDelta,
                        stockAfter: newStock!,
                        note: "Ajuste manual",
                    },
                });
            }

            return product;
        });

        if (hasStockChange && stockDelta < 0) {
            dispararAlertaStock(updated.name, newStock!, updated.minStock);
        }

        return updated;
    },

    async delete(id: string) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado");

        if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);

        await prisma.product.update({
            where: { id },
            data: { isActive: false, imageUrl: null, imagePublicId: null },
        });
    },

    async restore(id: string) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado");
        if (existing.isActive) throw new HttpError(400, "El producto ya está activo");

        return prisma.product.update({ where: { id }, data: { isActive: true }, include: PRODUCT_INCLUDE });
    },

    /** Filas que tendrá la exportación, para decidir el tope antes de escribir nada (T2-05). */
    async contarParaExportar() {
        return prisma.product.count();
    },

    /**
     * T2-05 — el catálogo en lotes, por cursor.
     *
     * Se pagina con cursor y no con `skip`: `OFFSET` obliga a Postgres a leer y
     * descartar todas las filas anteriores en cada página, así que la última página de
     * una exportación grande cuesta lo que la tabla entera.
     *
     * El desempate por `id` no estaba antes, y es lo que hace **correcta por
     * construcción** la paginación: `createdAt` no es único —una importación masiva crea
     * cientos de filas en el mismo instante—, y sin un orden total el resultado depende
     * de que Postgres devuelva el mismo orden arbitrario en cada página. En la práctica
     * lo hace mientras nadie escriba entre medias, y de hecho **los tests pasan también
     * sin el desempate**: no es un fallo reproducido, es dejar de depender de una
     * casualidad. Antes daba igual porque no había páginas.
     */
    async *exportarPorLotes() {
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.product.findMany({
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: PRODUCT_EXPORT_SELECT,
            });

            if (pagina.length === 0) return;
            yield pagina.map(filaDeExportacion);
            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },

    async importBulk(products: ImportProductDto[]) {
        // T2-08 — un lote es **dos sentencias**, no dos por producto.
        //
        // Antes, cada elemento hacía su `create` y su movimiento por separado y el lote
        // los lanzaba a la vez: 50 elementos eran hasta 100 consultas simultáneas contra
        // un pool de 10 conexiones, cada una esperando hasta `connectionTimeoutMillis`
        // (5 s) a que se liberara una. Con la base al lado eso no se nota; con latencia o
        // con la base ocupada, es una importación que falla a medias por tiempo de espera
        // y no por los datos.
        //
        // El tamaño ya no gobierna la concurrencia —cada lote son dos sentencias—, así
        // que sirve para acotar otra cosa: cuánto trabajo se repite si un lote falla y
        // hay que reintentarlo fila a fila para saber **qué** fila fue. 200 filas × 7
        // columnas son 1400 parámetros, lejos del tope de Postgres.
        const TAM_LOTE = 200;
        const errors: Array<{ row: number; error: string }> = [];
        let created = 0;

        const [categories, brands] = await Promise.all([
            prisma.category.findMany({ select: { id: true, name: true } }),
            prisma.brand.findMany({ select: { id: true, name: true } }),
        ]);
        const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
        const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));

        /** Los datos de una fila del archivo, ya resueltos contra el catálogo. */
        const filaDeProducto = (dto: ImportProductDto) => ({
            name: dto.name,
            description: dto.description,
            price: parseFloat(String(dto.price)),
            stock: dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0,
            categoryId: dto.categoryName ? (categoryMap.get(dto.categoryName.toLowerCase()) ?? null) : null,
            brandId: dto.brandName ? (brandMap.get(dto.brandName.toLowerCase()) ?? null) : null,
            isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
        });

        for (let i = 0; i < products.length; i += TAM_LOTE) {
            const lote = products.slice(i, i + TAM_LOTE);

            try {
                const creados = await prisma.product.createManyAndReturn({
                    data: lote.map(filaDeProducto),
                    select: { id: true, stock: true },
                });

                // Los movimientos, también en una sola sentencia. El `stock` sale de la
                // fila devuelta y no del índice, así que no depende del orden en que
                // Postgres devuelva lo insertado.
                const movimientos = creados
                    .filter((p) => p.stock !== 0)
                    .map((p) => ({
                        productId: p.id,
                        type: "IMPORT" as StockMovementType,
                        delta: p.stock,
                        stockAfter: p.stock,
                        note: "Importación masiva",
                    }));
                if (movimientos.length > 0) {
                    await prisma.stockMovement.createMany({ data: movimientos });
                }

                created += creados.length;
            } catch {
                // `createMany` es **una** sentencia: o entra el lote entero o no entra
                // nada, así que reintentar fila a fila no puede duplicar lo ya insertado.
                // Se hace solo para poder decir *qué* fila falló, que es lo que el
                // usuario necesita para corregir su archivo; el camino rápido se queda
                // para el caso normal, que es que el archivo esté bien.
                const resultados = await Promise.allSettled(
                    lote.map(async (dto) => {
                        const fila = filaDeProducto(dto);
                        const product = await prisma.product.create({ data: fila });
                        await recordMovement(product.id, "IMPORT", fila.stock, fila.stock, "Importación masiva");
                        return product;
                    }),
                );

                resultados.forEach((resultado, indiceEnLote) => {
                    if (resultado.status === "fulfilled") {
                        created++;
                    } else {
                        errors.push({
                            row: i + indiceEnLote + 1,
                            error: resultado.reason?.message ?? "Error desconocido",
                        });
                    }
                });
            }
        }

        return { created, errors };
    },

    async getMovements(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
        if (!product) throw new HttpError(404, "Producto no encontrado");

        const movements = await prisma.stockMovement.findMany({
            where: { productId },
            orderBy: { createdAt: "asc" },
        });

        return { product, movements };
    },

    async exportMovements(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(404, "Producto no encontrado");

        const movements = await prisma.stockMovement.findMany({
            where: { productId },
            orderBy: { createdAt: "asc" },
        });

        return movements.map((m) => ({
            productName: product.name,
            sku: product.sku ?? "",
            type: m.type,
            delta: m.delta,
            stockAfter: m.stockAfter,
            note: m.note ?? "",
            createdAt: m.createdAt.toISOString(),
        }));
    },

    async createManualMovement(productId: string, dto: CreateManualMovementDto) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(404, "Producto no encontrado");
        if (!product.isActive) throw new HttpError(400, "No se puede registrar movimientos en un producto inactivo");

        const note = dto.note ? `${dto.reason} — ${dto.note}` : dto.reason;

        // Transacción interactiva: el ajuste de stock y su movimiento son atómicos.
        // Para OUT se usa un decremento condicional (stock >= cantidad) que evita la
        // race condition de leer-calcular-escribir bajo peticiones concurrentes.
        const newStock = await prisma.$transaction(async (tx) => {
            let resultingStock: number;
            let delta: number;

            if (dto.type === "ADJUSTMENT") {
                const updated = await tx.product.update({
                    where: { id: productId },
                    data: { stock: dto.quantity },
                });
                resultingStock = updated.stock;
                delta = updated.stock - product.stock;
            } else if (dto.type === "OUT") {
                const res = await tx.product.updateMany({
                    where: { id: productId, stock: { gte: dto.quantity } },
                    data: { stock: { decrement: dto.quantity } },
                });
                if (res.count === 0) throw new HttpError(400, "El stock no puede quedar negativo");
                const refreshed = await tx.product.findUniqueOrThrow({ where: { id: productId } });
                resultingStock = refreshed.stock;
                delta = -dto.quantity;
            } else {
                const updated = await tx.product.update({
                    where: { id: productId },
                    data: { stock: { increment: dto.quantity } },
                });
                resultingStock = updated.stock;
                delta = dto.quantity;
            }

            await tx.stockMovement.create({
                data: { productId, type: dto.type, delta, stockAfter: resultingStock, note },
            });

            return resultingStock;
        });

        // Solo alerta si el stock disminuyó respecto al valor previo.
        if (newStock < product.stock) {
            dispararAlertaStock(product.name, newStock, product.minStock);
        }

        return prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    },

    async bulkUpdateStock(dto: BulkStockDto) {
        const results: Array<{ productId: string; success: boolean; error?: string }> = [];

        await Promise.all(
            dto.items.map(async ({ productId, stock }) => {
                try {
                    const note = dto.reason ?? "Ajuste masivo de inventario";

                    // Lee, ajusta y registra el movimiento dentro de una única transacción
                    // para mantener stock y movimiento consistentes ante concurrencia.
                    const outcome = await prisma.$transaction(async (tx) => {
                        const product = await tx.product.findUnique({ where: { id: productId } });
                        if (!product) return null;

                        const delta = stock - product.stock;
                        await tx.product.update({ where: { id: productId }, data: { stock } });
                        await tx.stockMovement.create({
                            data: { productId, type: "ADJUSTMENT", delta, stockAfter: stock, note },
                        });
                        return { name: product.name, minStock: product.minStock, delta };
                    });

                    if (!outcome) {
                        results.push({ productId, success: false, error: "Producto no encontrado" });
                        return;
                    }

                    if (outcome.delta < 0) {
                        dispararAlertaStock(outcome.name, stock, outcome.minStock);
                    }

                    results.push({ productId, success: true });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Error desconocido";
                    results.push({ productId, success: false, error: message });
                }
            }),
        );

        return results;
    },

    async getPriceHistory(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(404, "Producto no encontrado");

        const history = await prisma.priceHistory.findMany({
            where: { productId },
            orderBy: { createdAt: "asc" },
        });

        return { product, history };
    },
};
