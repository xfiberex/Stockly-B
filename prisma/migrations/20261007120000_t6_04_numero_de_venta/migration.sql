-- T6-04 — número correlativo de venta.
--
-- La columna nace anulable porque la tabla ya tiene filas; se rellena aquí mismo y solo
-- entonces pasa a obligatoria y única.

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN "number" INTEGER;

-- ── Datos: las órdenes que ya existen ──────────────────────────────────────────────────────
--
-- `src/tests/numero-de-venta.test.ts` ejecuta **este archivo** desde el marcador de arriba hasta
-- el de «Restricciones», partiéndolo por cada `;` seguido de línea en blanco. Si se añade una
-- sentencia, va separada igual.
--
-- Se numeran por fecha de creación y, a igualdad, por `id`: el desempate no significa nada,
-- pero hace que la migración dé lo mismo cada vez que se ejecute sobre los mismos datos.
UPDATE "sale_orders" o
SET "number" = n.numero
FROM (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS numero
    FROM "sale_orders"
) n
WHERE n."id" = o."id";

-- El contador arranca en la última: la siguiente venta recibe el número que sigue.
INSERT INTO "counters" ("key", "value")
SELECT 'saleOrder', COALESCE(MAX("number"), 0) FROM "sale_orders";

-- ── Restricciones ──────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "sale_orders" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sale_orders_number_key" ON "sale_orders"("number");
