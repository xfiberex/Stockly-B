-- T5-10 — clasificación ABC de productos por facturación.
--
-- `product_abc` es una caché que se rellena entera desde las ventas (`reports.abc.ts`); nace
-- vacía y se llena en el primer listado del catálogo. Hasta entonces todos los productos son C,
-- que es lo que son sin ventas clasificadas. `abc_calculations` guarda de qué periodo salió.

-- CreateEnum
CREATE TYPE "AbcClass" AS ENUM ('A', 'B', 'C');

-- CreateTable
CREATE TABLE "product_abc" (
    "productId" TEXT NOT NULL,
    "abcClass" "AbcClass" NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "product_abc_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "abc_calculations" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abc_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_abc_abcClass_idx" ON "product_abc"("abcClass");

-- AddForeignKey
ALTER TABLE "product_abc" ADD CONSTRAINT "product_abc_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

