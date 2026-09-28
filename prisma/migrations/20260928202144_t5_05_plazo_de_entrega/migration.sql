-- T5-05 — plazo de entrega del proveedor, en días.
--
-- Anulable y sin valor por defecto, a propósito: ningún proveedor existente tiene un plazo
-- conocido, e inventarle uno haría que las sugerencias de reposición lo dieran por cierto.
-- Con `NULL`, la sugerencia usa el ajuste `defaultLeadTimeDays` y dice que lo ha usado.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "leadTimeDays" INTEGER;
