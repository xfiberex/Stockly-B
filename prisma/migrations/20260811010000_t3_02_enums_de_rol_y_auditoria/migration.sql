-- T3-02 — completa la conversión a enums que empezó `20260601200000`, que dejó fuera
-- `users.role` y los dos campos de texto de `audit_logs`.
--
-- Se escribe a mano, como aquella: el diff automático de Prisma para un cambio de `text`
-- a enum es borrar la columna y crearla vacía. Con `USING` los datos se conservan, y si
-- alguna fila tuviera un valor fuera del enum la migración falla en vez de perderla.
-- Comprobado antes de escribirla: los valores presentes son ADMIN/USER en `users` y
-- CREATE, DELETE, SALE_SHIP, SALE_CANCEL sobre Product y SaleOrder en `audit_logs`.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'STOCK_MOVEMENT', 'BULK_STOCK', 'ORDER_RECEIVE', 'ORDER_CANCEL', 'USER_ROLE_CHANGE', 'USER_ACTIVATE', 'USER_DEACTIVATE', 'SALE_SHIP', 'SALE_CANCEL', 'REFRESH_REUSE');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('Product', 'PurchaseOrder', 'SaleOrder', 'User', 'Tag', 'Category', 'Brand', 'Supplier');

-- AlterTable: users.role (text -> enum, conservando datos)
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';

-- AlterTable: audit_logs.action y .entity (text -> enum, conservando datos)
-- El índice `audit_logs_entity_action_idx` se reconstruye solo: Postgres lo recrea al
-- cambiar el tipo de las columnas que lo componen.
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction" USING ("action"::text::"AuditAction");
ALTER TABLE "audit_logs" ALTER COLUMN "entity" TYPE "AuditEntity" USING ("entity"::text::"AuditEntity");
