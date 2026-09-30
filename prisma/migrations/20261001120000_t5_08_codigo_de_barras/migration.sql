-- T5-08 — código de barras del producto: opcional y único, como el SKU.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
