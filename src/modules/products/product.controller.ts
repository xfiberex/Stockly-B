import { Request, Response, NextFunction } from "express";
import { productService } from "@/modules/products/product.service";
import { auditService } from "@/modules/audit-logs";
import { enviarExportacion } from "@/shared/lib/exportacion";
import type { CreateProductDto, UpdateProductDto, ProductQuery, MovementsQuery, ImportProductDto, CreateManualMovementDto, BulkStockDto } from "@/modules/products/product.types";

export const productController = {
    async getProducts(
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
    },

    async getProductById(
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
    },

    async createProduct(
        req: Request<{}, {}, CreateProductDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const product = await productService.create(req.body, req.file);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "CREATE", "Product", product.id, { name: product.name },
            );
            res.status(201).json({ success: true, message: "Producto creado exitosamente", data: product });
        } catch (error) {
            next(error);
        }
    },

    async updateProduct(
        req: Request<{ id: string }, {}, UpdateProductDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const product = await productService.update(req.params.id, req.body, req.file);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "UPDATE", "Product", req.params.id,
            );
            res.json({ success: true, message: "Producto actualizado exitosamente", data: product });
        } catch (error) {
            next(error);
        }
    },

    async deleteProduct(
        req: Request<{ id: string }>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            await productService.delete(req.params.id);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "DELETE", "Product", req.params.id,
            );
            res.json({ success: true, message: "Producto eliminado correctamente" });
        } catch (error) {
            next(error);
        }
    },

    async restoreProduct(
        req: Request<{ id: string }>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const product = await productService.restore(req.params.id);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "RESTORE", "Product", req.params.id,
            );
            res.json({ success: true, message: "Producto restaurado correctamente", data: product });
        } catch (error) {
            next(error);
        }
    },

    async getProductMovements(
        req: Request<{ id: string }, unknown, unknown, MovementsQuery>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            // T4-15: la query trae página y filtros. Sin ella el listado devolvía el
            // histórico entero, y con un producto de 100 000 movimientos eso tumbaba la API.
            const result = await productService.getMovements(req.params.id, req.query);
            res.json({ success: true, message: "Movimientos obtenidos exitosamente", data: result });
        } catch (error) {
            next(error);
        }
    },

    async exportProductMovements(
        req: Request<{ id: string }, unknown, unknown, MovementsQuery & { format?: string }>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            // T4-15 — **acepta los mismos filtros que el listado.** El tope de exportación
            // rechaza con 413 y el mensaje dice «filtra antes de exportar»; sin filtros aquí,
            // ese consejo era imposible de seguir y un producto con más movimientos que el
            // tope no había forma de exportarlo. Medido con el producto caliente de la prueba
            // de carga: 100 019 movimientos contra un tope de 100 000.
            // T4-15 — pasa al mismo escritor por lotes que el catálogo (T2-05). El comentario
            // que había aquí decía que «va acotado a un producto, así que no necesita
            // streaming», y esa es justo la suposición que rompe un producto caliente: el
            // histórico de uno solo puede ser mayor que el catálogo entero.
            await enviarExportacion(res, {
                formato: req.query.format,
                nombreArchivo: `movements-${req.params.id}`,
                mensaje: "Movimientos exportados exitosamente",
                total: await productService.contarMovimientosParaExportar(req.params.id, req.query),
                lotes: productService.exportarMovimientosPorLotes(req.params.id, req.query),
            });
        } catch (error) {
            next(error);
        }
    },

    async exportProducts(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            // T2-05: el servicio entrega lotes y la respuesta se escribe según llegan.
            await enviarExportacion(res, {
                formato: req.query.format as string | undefined,
                nombreArchivo: "products",
                mensaje: "Productos exportados exitosamente",
                total: await productService.contarParaExportar(),
                lotes: productService.exportarPorLotes(),
            });
        } catch (error) {
            next(error);
        }
    },

    async importProducts(
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
    },

    async createManualMovement(
        req: Request<{ id: string }, {}, CreateManualMovementDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const product = await productService.createManualMovement(req.params.id, req.body);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "STOCK_MOVEMENT", "Product", req.params.id,
                { type: req.body.type, quantity: req.body.quantity, reason: req.body.reason },
            );
            res.status(201).json({ success: true, message: "Movimiento registrado correctamente", data: product });
        } catch (error) {
            next(error);
        }
    },

    async bulkUpdateStock(
        req: Request<{}, {}, BulkStockDto>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const results = await productService.bulkUpdateStock(req.body);
            await auditService.log(
                { userId: req.userId, userEmail: req.userEmail },
                "BULK_STOCK", "Product", undefined,
                { items: req.body.items.length, reason: req.body.reason },
            );
            res.json({ success: true, message: "Ajuste masivo completado", data: results });
        } catch (error) {
            next(error);
        }
    },

    async getPriceHistory(
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
    },
};
