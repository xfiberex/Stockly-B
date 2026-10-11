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
    /** T5-14 — de qué almacén sale; sin él, del predeterminado. No se cambia después. */
    warehouseId?: string;
    items: SaleOrderItemDto[];
}

/**
 * T6-08 — una venta de mostrador. Cada línea es **un producto y una cantidad**: ni nombre ni
 * precio, que los pone el catálogo. No lleva notas: se cobra y se entrega en el momento.
 */
export interface CounterSaleDto {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerDocument?: string;
    /** T5-14 — el local en el que está el mostrador; sin él, el predeterminado. */
    warehouseId?: string;
    items: Array<{ productId: string; quantity: number }>;
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
