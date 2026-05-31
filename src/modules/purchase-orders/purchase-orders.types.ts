export type PurchaseOrderStatus = "PENDING" | "RECEIVED" | "CANCELLED";

export interface PurchaseOrderItemDto {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface CreatePurchaseOrderDto {
    supplierId?: string;
    notes?: string;
    items: PurchaseOrderItemDto[];
}

export interface UpdatePurchaseOrderDto {
    supplierId?: string;
    notes?: string;
    status?: PurchaseOrderStatus;
}
