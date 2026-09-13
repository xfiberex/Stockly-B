-- CreateEnum
CREATE TYPE "CostSource" AS ENUM ('PURCHASE_RECEIPT', 'MANUAL');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "costPrice" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "cost_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldCost" DECIMAL(12,4),
    "newCost" DECIMAL(12,4),
    "source" "CostSource" NOT NULL,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_history_productId_createdAt_idx" ON "cost_history"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "cost_history" ADD CONSTRAINT "cost_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_history" ADD CONSTRAINT "cost_history_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
