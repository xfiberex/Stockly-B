import { Request, Response, NextFunction } from "express";
import { productService } from "@/modules/products/product.service";
import { auditService } from "@/modules/audit-logs";
import { buildCsv } from "@/shared/lib/csv";
import type { CreateProductDto, UpdateProductDto, ProductQuery, ImportProductDto, CreateManualMovementDto, BulkStockDto } from "@/modules/products/product.types";

async function getActorEmail(userId: string): Promise<string | undefined> {
    try {
        const { prisma } = await import("@/shared/lib/prisma");
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        return user?.email;
    } catch { return undefined; }
}

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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "CREATE", "Product", product.id, { name: product.name },
        );
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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "UPDATE", "Product", req.params.id,
        );
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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "DELETE", "Product", req.params.id,
        );
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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "RESTORE", "Product", req.params.id,
        );
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

export async function exportProductMovements(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const rows = await productService.exportMovements(req.params.id);
        const format = (req.query.format as string | undefined) ?? "json";

        if (format === "csv") {
            const csv = buildCsv(rows);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=movements-${req.params.id}.csv`);
            res.send(csv);
            return;
        }

        res.json({ success: true, message: "Movimientos exportados exitosamente", data: rows });
    } catch (error) {
        next(error);
    }
}

export async function exportProducts(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const products = await productService.exportAll();
        const format = (req.query.format as string | undefined) ?? "json";

        if (format === "csv") {
            const csv = buildCsv(products as unknown as Record<string, unknown>[]);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=products.csv");
            res.send(csv);
            return;
        }

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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "STOCK_MOVEMENT", "Product", req.params.id,
            { type: req.body.type, quantity: req.body.quantity, reason: req.body.reason },
        );
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
        await auditService.log(
            { userId: req.userId, userEmail: await getActorEmail(req.userId!) },
            "BULK_STOCK", "Product", undefined,
            { items: req.body.items.length, reason: req.body.reason },
        );
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
