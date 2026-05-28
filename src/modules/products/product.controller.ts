import { Request, Response, NextFunction } from "express";
import { prisma } from "@/shared/lib/prisma";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import type { CreateProductDto, UpdateProductDto, ProductQuery } from "@/modules/products/product.types";
import type { ApiResponse, PaginatedResponse } from "@/shared/types";

// Controlador para obtener productos con paginación y filtrado
export async function getProducts(
    req: Request<{}, {}, {}, ProductQuery>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Validar y normalizar parámetros de paginación y filtrado
        const page = Math.max(1, parseInt(req.query.page ?? "1", 10));

        // Limitar el número máximo de items por página a 100 para evitar sobrecargar el sistema
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit ?? "10", 10)),
        );

        // Calcular el número de items a saltar para la paginación
        const skip = (page - 1) * limit;

        // Construir el objeto de filtrado dinámicamente según los parámetros de query
        const isActiveFilter =
            req.query.isActive === "false"
                ? false
                : req.query.isActive === "true"
                  ? true
                  : undefined;

        const where = {
            ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
            ...(req.query.search && {
                name: {
                    contains: req.query.search,
                    mode: "insensitive" as const,
                },
            }),
            ...(req.query.category && { category: req.query.category }),
        };

        // Ejecutar ambas consultas (obtener productos y contar total) en una sola transacción para garantizar consistencia
        const [product, total] = await prisma.$transaction([
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.product.count({ where }),
        ]);

        // Construir la respuesta con el formato estándar de ApiResponse y PaginatedResponse
        const response: ApiResponse<PaginatedResponse<(typeof product)[0]>> = {
            success: true,
            message: "Productos obtenidos exitosamente",
            data: {
                data: product,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        };

        res.json(response);
    } catch (error) {
        next(error);
    }
}

// Controlador para obtener un producto por su ID
export async function getProductById(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
        });

        // Si no se encuentra el producto, responder con un error 404
        if (!product) {
            res.status(404).json({
                success: false,
                message: "Producto no encontrado",
            });
            return;
        }

        // Responder con el producto encontrado utilizando el formato estándar de ApiResponse
        res.json({
            success: true,
            message: "Producto obtenido exitosamente",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

// Controlador para crear un nuevo producto
export async function createProduct(
    req: Request<{}, {}, CreateProductDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Manejar la subida de imagen a Cloudinary si se proporciona un archivo
        let imageUrl: string | undefined;
        let imagePublicId: string | undefined;

        // Si se sube una imagen, subirla a Cloudinary y obtener la URL y el publicId para almacenarlos en la base de datos
        if (req.file) {
            const uploaded = await uploadToCloudinary(
                req.file.buffer,
                "stockly/products",
            );
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        }

        // Crear el producto en la base de datos utilizando Prisma, incluyendo la URL de la imagen si se subió una
        const product = await prisma.product.create({
            data: {
                description: req.body.description,
                name: req.body.name,
                stock:
                    req.body.stock !== undefined
                        ? parseInt(String(req.body.stock), 10)
                        : 0,
                price: parseFloat(String(req.body.price)),
                imageUrl,
                imagePublicId,
                category: req.body.category,
            },
        });

        // Responder con el producto creado utilizando el formato estándar de ApiResponse
        res.status(201).json({
            success: true,
            message: "Producto creado exitosamente",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

// Controlador para actualizar un producto existente
export async function updateProduct(
    req: Request<{ id: string }, {}, UpdateProductDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Validar que el producto existe antes de intentar actualizarlo
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
        });

        // Si no se encuentra el producto, responder con un error 404
        if (!existing) {
            res.status(404).json({
                success: false,
                message: "Producto no encontrado",
            });
            return;
        }

        // Manejar la actualización de la imagen: si se sube una nueva imagen, eliminar la anterior de Cloudinary y subir la nueva
        let imageUrl: string | null | undefined = existing.imageUrl;
        let imagePublicId: string | null | undefined = existing.imagePublicId;

        if (req.file) {
            if (existing.imagePublicId) {
                await deleteFromCloudinary(existing.imagePublicId);
            }
            const uploaded = await uploadToCloudinary(
                req.file.buffer,
                "stockly/products",
            );
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        } else if (String(req.body.removeImage) === "true") {
            if (existing.imagePublicId) {
                await deleteFromCloudinary(existing.imagePublicId);
            }
            imageUrl = null;
            imagePublicId = null;
        }

        // Actualizar el producto en la base de datos utilizando Prisma, incluyendo la URL de la imagen si se actualizó
        const { name, description, price, stock, category } = req.body;
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(price !== undefined && {
                    price: parseFloat(String(price)),
                }),
                ...(stock !== undefined && {
                    stock: parseInt(String(stock), 10),
                }),
                ...(category !== undefined && { category }),
                imageUrl,
                imagePublicId,
            },
        });

        // Responder con el producto actualizado utilizando el formato estándar de ApiResponse
        res.json({
            success: true,
            message: "Producto actualizado exitosamente",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

// Controlador para eliminar un producto (soft delete)
export async function deleteProduct(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Validar que el producto existe antes de intentar eliminarlo
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
        });

        // Si no se encuentra el producto, responder con un error 404
        if (!existing) {
            res.status(404).json({
                success: false,
                message: "Producto no encontrado",
            });
            return;
        }

        // Manejar la eliminación de la imagen de Cloudinary si el producto tiene una imagen asociada
        if (existing.imagePublicId) {
            await deleteFromCloudinary(existing.imagePublicId);
        }

        // Realizar un soft delete del producto en la base de datos utilizando Prisma, marcándolo como inactivo y eliminando la URL de la imagen
        await prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: false, imageUrl: null, imagePublicId: null },
        });

        // Responder con un mensaje de éxito utilizando el formato estándar de ApiResponse
        res.json({
            success: true,
            message: "Producto eliminado correctamente",
        });
    } catch (error) {
        next(error);
    }
}

// Controlador para restaurar un producto eliminado (soft restore)
export async function restoreProduct(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Validar que el producto existe antes de intentar restaurarlo
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
        });

        // Si no se encuentra el producto, responder con un error 404
        if (!existing) {
            res.status(404).json({
                success: false,
                message: "Producto no encontrado",
            });
            return;
        }

        // Si el producto ya está activo, responder con un error 400 indicando que no se puede restaurar un producto que ya está activo
        if (existing.isActive) {
            res.status(400).json({
                success: false,
                message: "El producto ya está activo",
            });
            return;
        }

        // Realizar la restauración del producto en la base de datos utilizando Prisma, marcándolo como activo
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: true },
        });

        // Responder con el producto restaurado utilizando el formato estándar de ApiResponse
        res.json({
            success: true,
            message: "Producto restaurado correctamente",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}
