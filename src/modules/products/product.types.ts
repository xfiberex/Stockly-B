export interface CreateProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    category: string;
}

export interface UpdateProductDto {
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    category?: string;
    image?: File;
    removeImage?: boolean;
}

export interface ProductQuery {
    page?: string;
    limit?: string;
    search?: string;
    category?: string;
    isActive?: string;
}

export interface ImportProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    category: string;
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
