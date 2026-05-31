export interface CreateProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
}

export interface UpdateProductDto {
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    removeImage?: boolean;
}

export interface ProductQuery {
    page?: string;
    limit?: string;
    search?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    isActive?: string;
}

// Formato plano aceptado en importaciones masivas (usa nombres, no UUIDs)
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
