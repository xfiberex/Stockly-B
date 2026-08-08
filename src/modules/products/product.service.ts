import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import { dispararAlertaStock } from "@/shared/lib/stockAlerts";
import { parsePagination } from "@/shared/lib/pagination";
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

    async exportAll() {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: "desc" },
            select: {
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
            },
        });

        return products.map((p) => ({
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
        }));
    },

    async importBulk(products: ImportProductDto[]) {
        const BATCH_SIZE = 50;
        const errors: Array<{ row: number; error: string }> = [];
        let created = 0;

        const [categories, brands] = await Promise.all([
            prisma.category.findMany({ select: { id: true, name: true } }),
            prisma.brand.findMany({ select: { id: true, name: true } }),
        ]);
        const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
        const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (dto) => {
                    const stock = dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0;
                    const categoryId = dto.categoryName ? (categoryMap.get(dto.categoryName.toLowerCase()) ?? null) : null;
                    const brandId = dto.brandName ? (brandMap.get(dto.brandName.toLowerCase()) ?? null) : null;

                    const product = await prisma.product.create({
                        data: {
                            name: dto.name,
                            description: dto.description,
                            price: parseFloat(String(dto.price)),
                            stock,
                            categoryId,
                            brandId,
                            isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
                        },
                    });
                    await recordMovement(product.id, "IMPORT", stock, stock, "Importación masiva");
                    return product;
                }),
            );

            results.forEach((result, batchIndex) => {
                if (result.status === "fulfilled") {
                    created++;
                } else {
                    errors.push({ row: i + batchIndex + 1, error: result.reason?.message ?? "Error desconocido" });
                }
            });
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
