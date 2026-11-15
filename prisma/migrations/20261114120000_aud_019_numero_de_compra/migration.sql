-- AUD-019 — número correlativo de compra, como el de venta (T6-04).
--
-- La columna nace anulable porque la tabla ya tiene filas; se rellena aquí mismo y solo
-- entonces pasa a obligatoria y única. La tabla `counters` ya existe: la creó T6-04.

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "number" INTEGER;

-- ── Datos: las órdenes que ya existen ──────────────────────────────────────────────────────
--
-- `src/tests/numero-de-compra.test.ts` ejecuta **este archivo** desde el marcador de arriba hasta
-- el de «Restricciones», partiéndolo por cada `;` seguido de línea en blanco. Si se añade una
-- sentencia, va separada igual.
--
-- Se numeran por fecha de creación y, a igualdad, por `id`: el desempate no significa nada,
-- pero hace que la migración dé lo mismo cada vez que se ejecute sobre los mismos datos.
UPDATE "purchase_orders" o
SET "number" = n.numero
FROM (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS numero
    FROM "purchase_orders"
) n
WHERE n."id" = o."id";

-- El contador arranca en la última: la siguiente compra recibe el número que sigue.
INSERT INTO "counters" ("key", "value")
SELECT 'purchaseOrder', COALESCE(MAX("number"), 0) FROM "purchase_orders";

-- ── Restricciones ──────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");
