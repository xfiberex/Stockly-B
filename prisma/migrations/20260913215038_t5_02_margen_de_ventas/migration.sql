-- AlterTable
ALTER TABLE "sale_order_items" ADD COLUMN     "unitCost" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sale_orders_status_shippedAt_idx" ON "sale_orders"("status", "shippedAt");

-- T5-02 — las ventas ya enviadas no tenían fecha de envío. La mejor aproximación que queda
-- es su `updatedAt`: el envío es la última transición que admite una orden enviada, salvo
-- una edición posterior de los datos del cliente, que lo retrasaría. Solo afecta a
-- `shippedAt`; `unitCost` se deja a NULL a propósito, porque el coste de entonces no se
-- conoce y rellenarlo con el actual daría un margen falso.
UPDATE "sale_orders" SET "shippedAt" = "updatedAt" WHERE "status" = 'SHIPPED' AND "shippedAt" IS NULL;
