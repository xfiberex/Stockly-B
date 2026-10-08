export type SaleOrderStatus = "PENDING" | "SHIPPED" | "CANCELLED";

export interface SaleOrderItemDto {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface CreateSaleOrderDto {
    /** T5-06 — sin él, la venta se vincula sola por su correo, si lo tiene. */
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    /** T6-06 — sin él, se copia el del cliente vinculado. */
    customerDocument?: string;
    notes?: string;
    items: SaleOrderItemDto[];
}

export interface UpdateSaleOrderDto {
    /** T5-06 — `null` desvincula la orden; ausente, no la toca. */
    customerId?: string | null;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    /** T6-06 — sin él, se copia el del cliente vinculado. */
    customerDocument?: string;
    notes?: string;
    status?: SaleOrderStatus;
}
