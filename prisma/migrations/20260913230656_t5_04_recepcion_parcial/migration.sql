-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED' AFTER 'PENDING';

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "receivedQuantity" INTEGER NOT NULL DEFAULT 0;

-- T5-04 — hasta ahora una orden recibida lo había recibido todo, así que sus líneas entran
-- completas. Sin esto, cancelar una orden recibida antes de la tarea retiraría 0 unidades y
-- dejaría en el inventario lo que entró con ella: el defecto de T0-04, reintroducido por la
-- migración. Las canceladas se dejan en 0 aunque hubieran pasado por recibida: su stock ya
-- se retiró al cancelarlas, y ya no admiten cambios.
UPDATE "purchase_order_items" AS i
SET "receivedQuantity" = i."quantity"
FROM "purchase_orders" AS o
WHERE o."id" = i."purchaseOrderId" AND o."status" = 'RECEIVED';
