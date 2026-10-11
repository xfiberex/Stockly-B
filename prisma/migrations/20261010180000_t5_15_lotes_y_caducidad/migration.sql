-- T5-15 — Lotes y fechas de caducidad.
--
-- El nivel de stock deja de ser «producto y almacén» y pasa a ser «producto, almacén y lote»
-- (ADR 0011). **Nada de lo que hay cambia de sitio**: todo el stock existente se queda en su
-- fila de siempre, que ahora es la de «sin lote» (`lotId` a `NULL`), y ningún producto lleva
-- lotes hasta que alguien lo marque.
--
-- Es rápida —dos columnas que nacen vacías y un índice sobre `stock_levels`—, pero **no es
-- expansiva**: la versión anterior de la aplicación escribe los niveles con
-- `ON CONFLICT ("productId", "warehouseId")`, y ese índice único deja de existir. Se aplica con
-- la aplicación parada (operaciones.md §6).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LOT_EXPIRING';

-- AlterTable — `false` en todo el catálogo: quien no marca nada sigue como estaba.
ALTER TABLE "products" ADD COLUMN "tracksLots" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_order_item_lots" (
    "id" TEXT NOT NULL,
    "saleOrderItemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_order_item_lots_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stock_levels" ADD COLUMN "lotId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "lotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lots_productId_code_key" ON "lots"("productId", "code");
CREATE INDEX "lots_expiresAt_idx" ON "lots"("expiresAt");
CREATE INDEX "sale_order_item_lots_saleOrderItemId_idx" ON "sale_order_item_lots"("saleOrderItemId");
CREATE INDEX "sale_order_item_lots_lotId_idx" ON "sale_order_item_lots"("lotId");
CREATE INDEX "stock_levels_lotId_idx" ON "stock_levels"("lotId");

-- El nivel pasa a ser único por producto, almacén **y lote**.
--
-- `NULLS NOT DISTINCT` (PostgreSQL 15 o posterior) es lo que Prisma no sabe escribir y por eso
-- va a mano: sin ello, dos filas «sin lote» del mismo producto en el mismo almacén serían
-- distintas para el índice —`NULL` no es igual a `NULL`—, y el `ON CONFLICT` con el que
-- `shared/lib/stock.ts` suma a un nivel crearía una fila nueva en cada entrada.
DROP INDEX "stock_levels_productId_warehouseId_key";
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_lotId_key"
    ON "stock_levels"("productId", "warehouseId", "lotId") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_order_item_lots" ADD CONSTRAINT "sale_order_item_lots_saleOrderItemId_fkey" FOREIGN KEY ("saleOrderItemId") REFERENCES "sale_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_order_item_lots" ADD CONSTRAINT "sale_order_item_lots_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
