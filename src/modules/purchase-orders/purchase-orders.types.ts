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
    /** T5-14 — a qué almacén entra lo recibido; sin él, al predeterminado. No se cambia después. */
    warehouseId?: string;
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

/**
 * T5-05 — las líneas revisadas en la pantalla de sugerencias. Cantidad y precio son los que
 * decide quien revisa; el proveedor no viaja, sale del producto.
 */
export interface GenerarDesdeSugerenciasDto {
    /** T5-14 — el almacén de todas las órdenes que salgan; sin él, el predeterminado. */
    warehouseId?: string;
    items: Array<{ productId: string; quantity: number; unitPrice: number }>;
}
