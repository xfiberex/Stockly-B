export type PurchaseOrderStatus = "PENDING" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

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

/** T5-04 — una entrega: cuánto llega de cada línea. Las que no aparecen no reciben nada. */
export interface ReceivePurchaseOrderDto {
    items: Array<{ itemId: string; quantity: number }>;
}
