-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleOrderStatus" AS ENUM ('PENDING', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'IMPORT');

-- AlterTable: purchase_orders.status (text -> enum, conservando datos)
ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "status" TYPE "PurchaseOrderStatus" USING ("status"::text::"PurchaseOrderStatus");
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: sale_orders.status (text -> enum, conservando datos)
ALTER TABLE "sale_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sale_orders" ALTER COLUMN "status" TYPE "SaleOrderStatus" USING ("status"::text::"SaleOrderStatus");
ALTER TABLE "sale_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: stock_movements.type (text -> enum, conservando datos)
ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE "StockMovementType" USING ("type"::text::"StockMovementType");
