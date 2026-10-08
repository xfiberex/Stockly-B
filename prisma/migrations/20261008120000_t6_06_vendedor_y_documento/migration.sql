-- T6-06 — quién registró la venta y el documento del cliente.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "document" TEXT;

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN "customerDocument" TEXT,
ADD COLUMN "createdByEmail" TEXT;

-- ── Datos: las órdenes que ya existen ──────────────────────────────────────────────────────
--
-- `src/tests/vendedor-y-documento.test.ts` ejecuta **este archivo** desde el marcador de arriba,
-- partiéndolo por cada `;` seguido de línea en blanco. Si se añade una sentencia, va separada
-- igual, y sin líneas en blanco dentro.
--
-- Quién registró cada venta solo constaba en la auditoría: la fila `CREATE` sobre `SaleOrder`
-- con su `entityId`. Si hubiera más de una —no debería—, manda la más antigua. Una orden sin
-- fila ahí —sembrada, o creada antes de que existiera la auditoría— se queda sin vendedor:
-- no se inventa.
UPDATE "sale_orders" o
SET "createdByEmail" = a."userEmail"
FROM (
    SELECT DISTINCT ON ("entityId") "entityId", "userEmail"
    FROM "audit_logs"
    WHERE "action" = 'CREATE' AND "entity" = 'SaleOrder' AND "userEmail" IS NOT NULL
    ORDER BY "entityId", "createdAt", "id"
) a
WHERE a."entityId" = o."id";

-- Cuántas se quedan sin vendedor. Sale como aviso en el registro de PostgreSQL: es el número
-- que hay que mirar tras aplicar la migración en un despliegue con datos.
DO $$
DECLARE
    total integer;
    sin_vendedor integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE "createdByEmail" IS NULL) INTO total, sin_vendedor FROM "sale_orders";
    RAISE NOTICE 'T6-06: % de % órdenes de venta se quedan sin vendedor (sin fila CREATE en audit_logs)', sin_vendedor, total;
END $$;
