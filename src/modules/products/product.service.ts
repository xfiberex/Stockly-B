import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import type { CreateProductDto, UpdateProductDto, ProductQuery, ImportProductDto } from "@/modules/products/product.types";

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
            ...(query.category && { category: query.category }),
        };

        // Ambas queries en la misma transacción para consistencia de datos
        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
            prisma.product.count({ where }),
        ]);

        return {
            data: products,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    async getById(id: string) {
        const product = await prisma.product.findUnique({ where: { id } });
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

        return prisma.product.create({
            data: {
                name: dto.name,
                description: dto.description,
                price: dto.price !== undefined ? parseFloat(String(dto.price)) : 0,
                stock: dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0,
                category: dto.category,
                imageUrl,
                imagePublicId,
            },
        });
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

        return prisma.product.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.price !== undefined && { price: parseFloat(String(dto.price)) }),
                ...(dto.stock !== undefined && { stock: parseInt(String(dto.stock), 10) }),
                ...(dto.category !== undefined && { category: dto.category }),
                imageUrl,
                imagePublicId,
            },
        });
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

        return prisma.product.update({ where: { id }, data: { isActive: true } });
    },

    async exportAll() {
        return prisma.product.findMany({
            orderBy: { createdAt: "desc" },
            select: { name: true, description: true, price: true, stock: true, category: true, isActive: true },
        });
    },

    async importBulk(products: ImportProductDto[]) {
        const BATCH_SIZE = 50;
        const errors: Array<{ row: number; error: string }> = [];
        let created = 0;

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map((dto) =>
                    prisma.product.create({
                        data: {
                            name: dto.name,
                            description: dto.description,
                            price: parseFloat(String(dto.price)),
                            stock: dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0,
                            category: dto.category,
                            isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
                        },
                    }),
                ),
            );

            results.forEach((result, batchIndex) => {
                const globalRow = i + batchIndex + 1;
                if (result.status === "fulfilled") {
                    created++;
                } else {
                    errors.push({ row: globalRow, error: result.reason?.message ?? "Error desconocido" });
                }
            });
        }

        return { created, errors };
    },
};
