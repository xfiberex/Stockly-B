-- T5-06 — clientes como entidad.
--
-- Hasta aquí el cliente eran tres textos sueltos en cada orden de venta. La orden **conserva**
-- esos tres campos como instantánea —como `productName` en los ítems— y gana `customerId`.

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'Customer';

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "sale_orders_customerId_createdAt_idx" ON "sale_orders"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Datos: las órdenes que ya existen ─────────────────────────────────────────
--
-- Un cliente por **correo normalizado** (minúsculas, sin espacios alrededor), que es la misma
-- regla con la que el servicio vincula las órdenes nuevas. Las órdenes sin correo **no se
-- agrupan por nombre**: dos «Juan Pérez» no son la misma persona. Se quedan sin cliente.
--
-- Del cliente se toma el nombre y el teléfono de su orden **más reciente** que los tenga —es
-- el dato con más probabilidad de seguir vigente—; sin nombre en ninguna, el propio correo. Su
-- fecha de alta es la de su primera orden.
--
-- `src/tests/clientes-migracion.test.ts` ejecuta este bloque contra órdenes de prueba: parte el
-- archivo por el marcador de arriba y por las líneas en blanco tras un `;`, así que cada
-- sentencia de aquí abajo tiene que acabar en `;` seguido de una línea en blanco.

INSERT INTO "customers" ("id", "name", "email", "phone", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    COALESCE(
        (SELECT NULLIF(BTRIM(o2."customerName"), '') FROM "sale_orders" o2
          WHERE LOWER(BTRIM(o2."customerEmail")) = correo AND NULLIF(BTRIM(o2."customerName"), '') IS NOT NULL
          ORDER BY o2."createdAt" DESC LIMIT 1),
        correo
    ),
    correo,
    (SELECT NULLIF(BTRIM(o2."customerPhone"), '') FROM "sale_orders" o2
      WHERE LOWER(BTRIM(o2."customerEmail")) = correo AND NULLIF(BTRIM(o2."customerPhone"), '') IS NOT NULL
      ORDER BY o2."createdAt" DESC LIMIT 1),
    MIN("createdAt"),
    CURRENT_TIMESTAMP
FROM (
    SELECT LOWER(BTRIM("customerEmail")) AS correo, "createdAt"
    FROM "sale_orders"
    WHERE NULLIF(BTRIM("customerEmail"), '') IS NOT NULL
) AS con_correo
GROUP BY correo;

UPDATE "sale_orders" so
SET "customerId" = c."id"
FROM "customers" c
WHERE so."customerId" IS NULL
  AND c."email" = LOWER(BTRIM(so."customerEmail"));

-- El recuento que pide la ficha —cuántas órdenes quedaron vinculadas y cuántas no— no puede
-- salir de aquí: `prisma migrate deploy` no enseña los avisos de PostgreSQL. La consulta está en
-- `docs/operaciones.md`, para ejecutarla después de desplegar.
