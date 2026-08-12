export interface CreateProductDto {
    name: string;
    description?: string;
    sku?: string;
    price: number;
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
    price?: number;
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

export interface ImportProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    categoryName?: string;
    brandName?: string;
    isActive?: boolean;
}

export interface ImportResult {
    created: number;
    errors: Array<{ row: number; error: string }>;
}

export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT" | "IMPORT";

export interface StockMovement {
    id: string;
    productId: string;
    type: StockMovementType;
    delta: number;
    stockAfter: number;
    note?: string | null;
    createdAt: string;
}

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
