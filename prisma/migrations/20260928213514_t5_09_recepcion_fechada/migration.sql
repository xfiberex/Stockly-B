-- T5-09 — cada entrada de una compra, enlazada a la línea que recibe.
--
-- La orden sabe cuánto lleva recibido de cada línea (`receivedQuantity`, T5-04), pero no
-- cuándo llegó cada parte. El informe de compras por periodo lo necesita: una orden recibida
-- la mitad en marzo y la otra mitad en abril son dos compras de dos meses distintos.

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "purchaseOrderItemId" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_purchaseOrderItemId_idx" ON "stock_movements"("purchaseOrderItemId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las recepciones ya registradas se enlazan por lo único que las identifica: la nota que
-- escribe la recepción —«Orden de compra #» y los 8 primeros caracteres del id de la orden,
-- el mismo formato desde que existen las órdenes— y el producto.
--
-- Solo se enlaza lo que tiene **una única** línea candidata. Dos órdenes cuyos ids empiezan
-- igual y piden el mismo producto, o una orden con el producto repetido en dos líneas, no se
-- pueden distinguir por la nota; esas entradas se quedan sin enlazar y no cuentan en el
-- informe de compras, en vez de contar en una línea que quizá no es la suya.
WITH candidatas AS (
    SELECT sm.id AS movimiento, MIN(poi.id) AS linea, COUNT(*) AS cuantas
    FROM "stock_movements" sm
    JOIN "purchase_order_items" poi
      ON poi."productId" = sm."productId"
     AND sm.note = 'Orden de compra #' || LEFT(poi."purchaseOrderId", 8)
    WHERE sm.type = 'IN'
    GROUP BY sm.id
)
UPDATE "stock_movements" sm
SET "purchaseOrderItemId" = c.linea
FROM candidatas c
WHERE c.movimiento = sm.id AND c.cuantas = 1;
