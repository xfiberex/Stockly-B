export type SaleOrderStatus = "PENDING" | "SHIPPED" | "CANCELLED";

export interface SaleOrderItemDto {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface CreateSaleOrderDto {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    notes?: string;
    items: SaleOrderItemDto[];
}

export interface UpdateSaleOrderDto {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    notes?: string;
    status?: SaleOrderStatus;
}
