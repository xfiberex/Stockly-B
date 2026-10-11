-- T5-14 — Varios almacenes.
--
-- El stock deja de ser un número por producto y pasa a ser uno por producto y almacén
-- (`stock_levels`). `products.stock` se conserva como total (ADR 0010).
--
-- **Todo el stock que hay se queda donde estaba**: la migración crea un almacén, «Principal»,
-- y le asigna el stock de cada producto, sus movimientos, sus órdenes y sus conteos. Ningún
-- total cambia.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_TRANSFER';
ALTER TYPE "AuditEntity" ADD VALUE 'Warehouse';
ALTER TYPE "AuditEntity" ADD VALUE 'StockTransfer';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER';

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "note" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- El almacén al que va todo lo que ya existe.
INSERT INTO "warehouses" ("id", "name", "isDefault", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Principal', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- El stock de cada producto, a ese almacén. Los que están a cero no llevan fila: la tabla es
-- dispersa y «sin fila» ya significa cero.
INSERT INTO "stock_levels" ("id", "productId", "warehouseId", "stock")
SELECT gen_random_uuid()::text, p."id", w."id", p."stock"
FROM "products" p
JOIN "warehouses" w ON w."isDefault"
WHERE p."stock" <> 0;

-- AlterTable — las columnas nacen opcionales, se rellenan y entonces se hacen obligatorias.
ALTER TABLE "inventory_counts" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "sale_orders" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "transferId" TEXT,
ADD COLUMN "warehouseId" TEXT,
ADD COLUMN "warehouseStockAfter" INTEGER;

UPDATE "inventory_counts" SET "warehouseId" = (SELECT "id" FROM "warehouses" WHERE "isDefault");
UPDATE "purchase_orders" SET "warehouseId" = (SELECT "id" FROM "warehouses" WHERE "isDefault");
UPDATE "sale_orders" SET "warehouseId" = (SELECT "id" FROM "warehouses" WHERE "isDefault");
-- Con un solo almacén, lo que quedó en él tras cada movimiento es lo que quedó en total.
UPDATE "stock_movements"
SET "warehouseId" = (SELECT "id" FROM "warehouses" WHERE "isDefault"),
    "warehouseStockAfter" = "stockAfter";

ALTER TABLE "inventory_counts" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "sale_orders" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "warehouseId" SET NOT NULL,
ALTER COLUMN "warehouseStockAfter" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");
CREATE INDEX "stock_levels_warehouseId_idx" ON "stock_levels"("warehouseId");
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_key" ON "stock_levels"("productId", "warehouseId");
CREATE INDEX "stock_transfers_createdAt_idx" ON "stock_transfers"("createdAt");
CREATE INDEX "sale_orders_warehouseId_createdAt_idx" ON "sale_orders"("warehouseId", "createdAt");
CREATE INDEX "stock_movements_transferId_idx" ON "stock_movements"("transferId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Lo que Prisma no sabe expresar, y por eso vive solo aquí ──────────────────
--
-- `prisma db push` **no** trae lo que sigue: una base que se sincronice así se queda sin esta
-- guarda (CONTEXTO.md §4). Se aplica con `prisma migrate deploy` o ejecutando este archivo con
-- `prisma db execute --file`.
--
-- **No hay un `CHECK (stock >= 0)` en `stock_levels`, y se probó.** Que un nivel no baje de cero
-- lo garantiza el decremento condicional (ADR 0001), que es quien resta. La restricción, además,
-- rompía lo que quería proteger: un stock negativo heredado de antes de aquel ADR se copia tal
-- cual al nivel, y con ella la primera recepción que no lo dejara en positivo —entran 2 sobre
-- −5— se rechazaba con un 500.

-- `products.stock` es la suma de los niveles del producto, **o la transacción no se confirma**.
--
-- Es una comprobación, no un mantenimiento: el total lo escribe el código, a la vista
-- (`shared/lib/stock.ts`), y esto solo se niega a confirmar si se equivoca. Diferida al
-- `COMMIT` porque dentro de la transacción las dos escrituras van una detrás de otra, y entre
-- las dos el total no cuadra por definición. Medido sobre 100 000 productos: 0,04 ms por
-- movimiento (rendimiento.md §15).
CREATE FUNCTION "stock_cuadra"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    producto text;
    total integer;
    suma integer;
BEGIN
    IF TG_TABLE_NAME = 'products' THEN
        producto := NEW."id";
    ELSIF TG_OP = 'DELETE' THEN
        producto := OLD."productId";
    ELSE
        producto := NEW."productId";
    END IF;

    SELECT "stock" INTO total FROM "products" WHERE "id" = producto;
    -- El producto se borró en esta misma transacción y sus niveles cayeron con él.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM("stock"), 0) INTO suma FROM "stock_levels" WHERE "productId" = producto;
    IF total <> suma THEN
        RAISE EXCEPTION 'El stock del producto % (%) no es la suma de sus almacenes (%)', producto, total, suma
            USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_cuadra';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "stock_levels_cuadra"
    AFTER INSERT OR UPDATE OR DELETE ON "stock_levels"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "stock_cuadra"();

CREATE CONSTRAINT TRIGGER "products_stock_cuadra"
    AFTER INSERT OR UPDATE OF "stock" ON "products"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "stock_cuadra"();
