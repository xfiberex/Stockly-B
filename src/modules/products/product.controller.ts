import { Request, Response, NextFunction } from "express";
import { productService } from "@/modules/products/product.service";
import type { CreateProductDto, UpdateProductDto, ProductQuery, ImportProductDto, CreateManualMovementDto, BulkStockDto } from "@/modules/products/product.types";

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

export async function getProductMovements(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await productService.getMovements(req.params.id);
        res.json({ success: true, message: "Movimientos obtenidos exitosamente", data: result });
    } catch (error) {
        next(error);
    }
}

export async function exportProducts(
    _req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const products = await productService.exportAll();
        res.json({ success: true, message: "Productos exportados exitosamente", data: products });
    } catch (error) {
        next(error);
    }
}

export async function importProducts(
    req: Request<{}, {}, { products: ImportProductDto[] }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await productService.importBulk(req.body.products);
        res.status(201).json({ success: true, message: `${result.created} productos importados`, data: result });
    } catch (error) {
        next(error);
    }
}

export async function createManualMovement(
    req: Request<{ id: string }, {}, CreateManualMovementDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const product = await productService.createManualMovement(req.params.id, req.body);
        res.status(201).json({ success: true, message: "Movimiento registrado correctamente", data: product });
    } catch (error) {
        next(error);
    }
}

export async function bulkUpdateStock(
    req: Request<{}, {}, BulkStockDto>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const results = await productService.bulkUpdateStock(req.body);
        res.json({ success: true, message: "Ajuste masivo completado", data: results });
    } catch (error) {
        next(error);
    }
}

export async function getPriceHistory(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await productService.getPriceHistory(req.params.id);
        res.json({ success: true, message: "Historial de precios obtenido", data: result });
    } catch (error) {
        next(error);
    }
}
