-- T6-05 — impuesto en la venta.
--
-- Solo la columna: las líneas que ya existen se quedan en NULL, que se lee como «sin impuesto».
-- No se rellenan con 0 a propósito: un 0 diría que se vendieron con la tasa a cero, y lo cierto
-- es que se vendieron antes de que hubiera tasa.

-- AlterTable
ALTER TABLE "sale_order_items" ADD COLUMN "taxRate" DECIMAL(5,2);
