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
