import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import type { CreateProductDto, UpdateProductDto, ProductQuery, ImportProductDto, StockMovementType } from "@/modules/products/product.types";

// Incluye categoría, marca y proveedor en todas las consultas de productos
const PRODUCT_INCLUDE = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
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
        const page = Math.max(1, parseInt(query.page ?? "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
        const skip = (page - 1) * limit;

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

        const product = await prisma.product.create({
            data: {
                name: dto.name,
                description: dto.description,
                price: dto.price !== undefined ? parseFloat(String(dto.price)) : 0,
                stock,
                categoryId: dto.categoryId ?? null,
                brandId: dto.brandId ?? null,
                supplierId: dto.supplierId ?? null,
                imageUrl,
                imagePublicId,
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

        const updated = await prisma.product.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.price !== undefined && { price: parseFloat(String(dto.price)) }),
                ...(dto.stock !== undefined && { stock: parseInt(String(dto.stock), 10) }),
                ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
                ...(dto.brandId !== undefined && { brandId: dto.brandId }),
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                imageUrl,
                imagePublicId,
            },
            include: PRODUCT_INCLUDE,
        });

        if (dto.stock !== undefined) {
            const newStock = parseInt(String(dto.stock), 10);
            const delta = newStock - existing.stock;
            const type = delta >= 0 ? "IN" : "OUT";
            await recordMovement(id, type, delta, newStock, "Ajuste manual");
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
                price: true,
                stock: true,
                isActive: true,
                category: { select: { name: true } },
                brand: { select: { name: true } },
                supplier: { select: { name: true } },
            },
        });

        // Aplanar las relaciones para compatibilidad con importaciones CSV/JSON
        return products.map((p) => ({
            name: p.name,
            description: p.description,
            price: p.price,
            stock: p.stock,
            isActive: p.isActive,
            categoryName: p.category?.name ?? null,
            brandName: p.brand?.name ?? null,
            supplierName: p.supplier?.name ?? null,
        }));
    },

    async importBulk(products: ImportProductDto[]) {
        const BATCH_SIZE = 50;
        const errors: Array<{ row: number; error: string }> = [];
        let created = 0;

        // Precarga todas las categorías y marcas para evitar N+1 en el bucle
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
};
