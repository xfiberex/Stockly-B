export interface CreateProductDto {
    name: string;
    description?: string;
    sku?: string;
    barcode?: string;
    price: number;
    costPrice?: number;
    stock?: number;
    minStock?: number;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    tagIds?: string[];
}

export interface UpdateProductDto {
    name?: string;
    description?: string;
    sku?: string;
    /** `null` quita el código (T5-08). */
    barcode?: string | null;
    price?: number;
    /** `null` quita el coste: vuelve a ser desconocido (T5-01). */
    costPrice?: number | null;
    stock?: number;
    minStock?: number;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    removeImage?: boolean;
    tagIds?: string[];
}

export interface ProductQuery {
    page?: string;
    limit?: string;
    search?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    isActive?: string;
    tagId?: string;
    /** T5-10 — `A`, `B` o `C`. C incluye los productos sin ventas en el periodo. */
    abcClass?: string;
}

/** T5-08 — `GET /products/labels`. Todo llega como cadena de la query. */
export interface LabelsQuery {
    ids?: string;
    format?: string;
    copies?: string;
}

/**
 * T4-15 — los filtros del histórico de un producto. Van por query string porque el
 * listado se pagina en la base: filtrarlos en el navegador filtraría solo la página traída.
 */
export interface MovementsQuery {
    page?: string;
    limit?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
}

/** T5-01 — el histórico de costes se pagina igual que el de movimientos. */
export interface CostHistoryQuery {
    page?: string;
    limit?: string;
}

export interface ImportProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    categoryName?: string;
    brandName?: string;
    isActive?: boolean;
}

export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT" | "IMPORT";

export interface CreateManualMovementDto {
    type: "IN" | "OUT" | "ADJUSTMENT";
    quantity: number;
    reason: string;
    note?: string;
}

export interface BulkStockDto {
    items: Array<{ productId: string; stock: number }>;
    reason?: string;
}
