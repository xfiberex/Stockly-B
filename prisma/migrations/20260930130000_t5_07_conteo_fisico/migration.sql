-- T5-07 — conteo físico de inventario: sesiones, líneas y las acciones de auditoría de su cierre.

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- AlterEnum


ALTER TYPE "AuditAction" ADD VALUE 'COUNT_CLOSE';
ALTER TYPE "AuditAction" ADD VALUE 'COUNT_CANCEL';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'InventoryCount';

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "categoryId" TEXT,
    "createdByEmail" TEXT,
    "closedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "countedQuantity" INTEGER,
    "expectedQuantity" INTEGER,
    "countedAt" TIMESTAMP(3),
    "countedByEmail" TEXT,
    "adjustment" INTEGER,
    "unitCost" DECIMAL(12,4),

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_counts_status_createdAt_idx" ON "inventory_counts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_count_lines_productId_idx" ON "inventory_count_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_countId_productId_key" ON "inventory_count_lines"("countId", "productId");

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

