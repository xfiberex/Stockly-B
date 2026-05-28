import { Request, Response, NextFunction } from "express";
import { productService } from "@/modules/products/product.service";
import type { CreateProductDto, UpdateProductDto, ProductQuery } from "@/modules/products/product.types";

export async function getProducts(
    req: Request<{}, {}, {}, ProductQuery>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await productService.getProducts(req.query);
        res.json({ success: true, message: "Productos obtenidos exitosamente", data: result });
    } catch (error) {
        next(error);
    }
}

export async function getProductById(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await productService.getById(req.params.id);
        res.json({ success: true, message: "Producto obtenido exitosamente", data: product });
    } catch (error) {
        next(error);
    }
}

export async function createProduct(
    req: Request<{}, {}, CreateProductDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await productService.create(req.body, req.file);
        res.status(201).json({ success: true, message: "Producto creado exitosamente", data: product });
    } catch (error) {
        next(error);
    }
}

export async function updateProduct(
    req: Request<{ id: string }, {}, UpdateProductDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await productService.update(req.params.id, req.body, req.file);
        res.json({ success: true, message: "Producto actualizado exitosamente", data: product });
    } catch (error) {
        next(error);
    }
}

export async function deleteProduct(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        await productService.delete(req.params.id);
        res.json({ success: true, message: "Producto eliminado correctamente" });
    } catch (error) {
        next(error);
    }
}

export async function restoreProduct(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await productService.restore(req.params.id);
        res.json({ success: true, message: "Producto restaurado correctamente", data: product });
    } catch (error) {
        next(error);
    }
}
