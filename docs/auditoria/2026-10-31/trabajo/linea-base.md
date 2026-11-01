# Línea base (ejecución) · datos recogidos
Encargo: pasos de pnpm verify de Stockly-B y Stockly-F, uno a uno, 2026-10-31
Modelo: Haiku 5.5 (claude-haiku-5-5)
Inventario estático (linea-base.sh): ver `inventario-stockly-b.md` e `inventario-stockly-f.md` en esta misma carpeta.

## Resultados

### Versiones
| Herramienta | Versión (salida del comando) |
|---|---|
| node | v22.23.2 (`node --version`) |
| pnpm | 12.4.1 (`pnpm --version`) |
| Stockly-B prisma | 7.9.1 (`pnpm exec prisma --version`); @prisma/client 7.9.1 |
| Stockly-B tsc | Version 6.0.3 |
| Stockly-B jest | 30.4.1 |
| Stockly-F tsc | Version 6.0.3 |
| Stockly-F vitest | vitest/4.1.7 win32-x64 node-v22.23.2 |
| Stockly-F eslint | v10.4.0 |
| Stockly-F vite | vite/8.2.1 win32-x64 node-v22.23.2 |
| Stockly-F playwright | Version 1.61.1 |

### Backend
| Paso | Comando exacto | Exit | Duración | Resultado (cifras copiadas) |
|---|---|---|---|---|
| 2a | `pnpm exec prisma generate` (salida con tail -5) | no capturado (sin error en la salida) | 4s | `✔ Generated Prisma Client (7.9.1) to .\src\generated\prisma in 466ms` |
| 2b | `pnpm exec prisma migrate status` (tail -15) | no capturado (sin error en la salida) | 3s | `32 migrations found in prisma/migrations`. `Following migrations have not yet been applied:` `20261010120000_t5_14_varios_almacenes`, `20261010180000_t5_15_lotes_y_caducidad`. Datasource: PostgreSQL database "stockly" at localhost:5432 |
| 2c | `bash diff-base-tests.sh "$B"` (solo lectura: Stockly_test contra prisma/schema.prisma) | 0 | no medido | NO está al día: la salida no es «-- This is an empty migration.». 172 líneas, copia íntegra más abajo |
| 2d | `pnpm run check` | 0 | 14s | `tsc --noEmit && tsc --noEmit -p tsconfig.seed.json`, sin errores en la salida |
| 2e | `pnpm run test:coverage` (con SMTP y Cloudinary `.invalid` en el entorno) | 1 | 238s | `Test Suites: 50 failed, 18 passed, 68 total`. `Tests: 1360 failed, 292 passed, 1652 total`. `Snapshots: 0 total`. `Time: 230.348 s`. Sin líneas de omitidos. Detalle de fallos y umbrales abajo |
| 2f | `pnpm run build` | 0 | 17s | `tsc && tsc-alias`, sin errores en la salida |
| 2g | `pnpm run smoke` (con SMTP y Cloudinary `.invalid`) | 0 | 4s | `✓ GET /api/v1/health responde 200` |
| 2h | `pnpm run auditoria` | 1 | 4s | `✗ 3 vulnerabilidad(es) alta o superior — crítica 0, alta 3, moderada 9, baja 2, info 0`. `✓ 159 paquetes de producción, 8 licencias, todas permitidas`. `[ELIFECYCLE] Command failed with exit code 1.` |
| 2i | `pnpm audit` (incluye desarrollo) | 1 | no medido | `31 vulnerabilities found`. `Severity: 3 low \| 16 moderate \| 10 high \| 2 critical` |

Detalle de 2e (`b-test.log`):
- Fallos más repetidos (conteo de líneas con grep -o; el texto va truncado por el patrón de búsqueda):
  - `The table (not available) does not exist`: 3287
  - `Invalid prisma.stockTransfer.deleteMany() invocation in`: 3287
  - `Invalid prisma.$queryRaw() invocation:`: 342
  - `Cannot read properties of undefined (reading 'mockRestore')`: 132
  - `Invalid tx.product.createManyAndReturn() invocation in`: 11
  - `Invalid prisma.product.create() invocation in`: 5
- Ficheros FAIL: 50 (por ejemplo `src/tests/lotes.test.ts`, `src/tests/auth.test.ts`, `src/tests/products.test.ts`).
- Umbrales (líneas del log `Jest: Coverage for ... does not meet "global" threshold`):
  - statements 39.9% < 85%
  - branches 18.93% < 72%
  - lines 41.64% < 87%
  - functions 21.07% < 87%

Salida entera de `diff-base-tests.sh` (paso 2c, 172 líneas):

```text
Loaded Prisma config from prisma.config.ts.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_TRANSFER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'Warehouse';
ALTER TYPE "AuditEntity" ADD VALUE 'StockTransfer';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LOT_EXPIRING';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "inventory_counts" ADD COLUMN     "warehouseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracksLots" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "warehouseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN     "warehouseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "transferId" TEXT,
ADD COLUMN     "warehouseId" TEXT NOT NULL,
ADD COLUMN     "warehouseStockAfter" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "sale_order_item_lots" (
    "id" TEXT NOT NULL,
    "saleOrderItemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_order_item_lots_pkey" PRIMARY KEY ("id")
);

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
    "lotId" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "sale_order_item_lots_saleOrderItemId_idx" ON "sale_order_item_lots"("saleOrderItemId");

-- CreateIndex
CREATE INDEX "sale_order_item_lots_lotId_idx" ON "sale_order_item_lots"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE INDEX "stock_levels_warehouseId_idx" ON "stock_levels"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_levels_lotId_idx" ON "stock_levels"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_lotId_key" ON "stock_levels"("productId", "warehouseId", "lotId");

-- CreateIndex
CREATE INDEX "lots_expiresAt_idx" ON "lots"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "lots_productId_code_key" ON "lots"("productId", "code");

-- CreateIndex
CREATE INDEX "stock_transfers_createdAt_idx" ON "stock_transfers"("createdAt");

-- CreateIndex
CREATE INDEX "sale_orders_warehouseId_createdAt_idx" ON "sale_orders"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_transferId_idx" ON "stock_movements"("transferId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_order_item_lots" ADD CONSTRAINT "sale_order_item_lots_saleOrderItemId_fkey" FOREIGN KEY ("saleOrderItemId") REFERENCES "sale_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_order_item_lots" ADD CONSTRAINT "sale_order_item_lots_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

```

### Frontend
| Paso | Comando exacto | Exit | Duración | Resultado (cifras copiadas) |
|---|---|---|---|---|
| 3a | `pnpm run check` | 0 | 21s | `$ tsc -b`, sin errores en la salida |
| 3b | `pnpm run lint` | 0 | 35s | `$ eslint .`, sin errores en la salida |
| 3c | `pnpm run test:coverage` | 0 | 182s (Duration de vitest: 174.51s) | `Test Files 80 passed (80)`. `Tests 910 passed \| 1 skipped (911)`. Sin FAIL ni × |
| 3d | `pnpm run build` | 0 | 32s | `✓ built in 13.87s`. 90 trozos en `dist/assets/`. Aviso: `(!) Your Vite config uses features that are unsupported by configLoader: 'native'...` |
| 3e | `pnpm run auditoria` | 1 | 3s | `✗ 5 vulnerabilidad(es) alta o superior — crítica 0, alta 5, moderada 4, baja 1, info 0`. `✓ 114 paquetes de producción, 8 licencias, todas permitidas` |
| 3f | `pnpm audit` | 1 | no medido | `38 vulnerabilities found`. `Severity: 4 low \| 19 moderate \| 15 high` |

### Cobertura
| Repo | Statements | Branches | Functions | Lines | ¿Umbral superado? |
|---|---|---|---|---|---|
| Stockly-B | 39.9 | 18.93 | 21.07 | 41.64 | No. Jest: statements 85%, branches 72%, lines 87%, functions 87% (mensajes "does not meet"). Cifras con 50 suites fallidas |
| Stockly-F | 80.84 | 84.93 | 71.23 | 83.02 | Sí. Umbrales de `vite.config.ts:135-138`: statements 45, branches 50, functions 33, lines 46. Sin mensaje de umbral en `f-test.log` |

Totales F (`Coverage summary`): Statements 2654/3283, Branches 2109/2483, Functions 832/1168, Lines 2352/2833.

### Tamaño de los trozos del build del frontend (10 mayores)
| # | Fichero | Tamaño | gzip |
|---|---|---|---|
| 1 | `dist/assets/zxing_reader-BxB2YfIY.wasm` | 1,093.28 kB | 463.82 kB |
| 2 | `dist/assets/vendor-charts-DUPWVh7x.js` | 391.39 kB | 110.87 kB |
| 3 | `dist/assets/vendor-bnbDAm86.js` | 351.69 kB | 106.37 kB |
| 4 | `dist/assets/axios-DkSPjjb9.js` | 130.21 kB | 36.80 kB |
| 5 | `dist/assets/vendor-forms-CeZtdX0p.js` | 104.32 kB | 30.46 kB |
| 6 | `dist/assets/vendor-router-dDmon_3H.js` | 91.97 kB | 30.52 kB |
| 7 | `dist/assets/index-1misBG0U.css` | 81.39 kB | 14.26 kB |
| 8 | `dist/assets/ProductsPage-Cos3nasE.js` | 75.53 kB | 25.78 kB |
| 9 | `dist/assets/vendor-escaner-imHrP-Vg.js` | 43.79 kB | 15.17 kB |
| 10 | `dist/assets/index-ZHi3L_EW.js` | 39.72 kB | 12.56 kB |

### Dependencias (pnpm audit)
| Repo | Alcance (prod / todo) | Crítica | Alta | Moderada | Baja | Licencias |
|---|---|---|---|---|---|---|
| Stockly-B | prod (`auditoria`) | 0 | 3 | 9 | 2 | 159 paquetes, 8 licencias, todas permitidas |
| Stockly-B | todo (`pnpm audit`) | 2 | 10 | 16 | 3 | — (la auditoría de licencias solo corre en prod) |
| Stockly-F | prod (`auditoria`) | 0 | 5 | 4 | 1 | 114 paquetes, 8 licencias, todas permitidas |
| Stockly-F | todo (`pnpm audit`) | 0 | 15 | 19 | 4 | — |

### CI
| Repo | Commit | Workflow | Conclusión | Fecha |
|---|---|---|---|---|
| Stockly-B | 8fccbd460b3d8244ebca608c02e09e77fa162eeb (8fccbd4) | verify | success | 2026-10-11T02:13:08Z (push, «feat(lotes): lotes y fechas de caducidad…») |
| Stockly-F | 424e39746036d3753651e8756a83bbe5b04afc4b (424e397) | verify | success | 2026-10-11T02:16:56Z (push, «feat(lotes): pantalla de caducidades…») |

### git status antes y después
| Momento | Stockly-B | Stockly-F |
|---|---|---|
| Antes (paso 0) | `?? docs/auditoria/` | (vacío) |
| Después (paso 5) | `?? docs/auditoria/` | (vacío) |

Sin diferencias en archivos versionados.

## Comandos sustituidos
- `prisma migrate deploy` → `prisma migrate status` (solo lectura)
- `pnpm verify` → sus pasos uno a uno; `smoke` con SMTP y Cloudinary `.invalid` en el entorno

## Repetición del backend tras migrar Stockly_test (conversación principal, 2026-10-31)

Autorizada por el usuario.

1. **Migración de la base de tests.** Se aplicó a `Stockly_test` el SQL de `20261010120000_t5_14_varios_almacenes` y `20261010180000_t5_15_lotes_y_caducidad`, con `prisma db execute --file …` y la URL derivada como en `jest.setup.js`, sin imprimirla. Las dos dieron «Script executed successfully», y después `diff-base-tests.sh` responde «-- This is an empty migration.».
2. **Ejecución:** `env <SMTP y Cloudinary .invalid> pnpm run test:coverage`. Exit 1, 193 s.
   - `Test Suites: 1 failed, 67 passed, 68 total`.
   - `Tests: 1 failed, 1651 passed, 1652 total`.
   - Cobertura (`All files`): **97,15 / 88,82 / 97,96 / 97,88**, por encima de los umbrales 85/72/87/87.
3. **El único fallo:** `src/tests/moneda.test.ts:216`, «Cambiar el símbolo a RD$ … el PDF de informes › con RD$, todos sus importes lo llevan». `expect(importes().length).toBeGreaterThan(8)` recibe `8`.
   - En la CI, con base nueva, pasa (verify en verde el 2026-10-11).
   - Sospecha: depende de los datos que acumula la base compartida. Lo valora el área 8.
   - Las demás líneas de error del registro (`Unique constraint failed`, código 23514 de `stock_cuadra`, enums inválidos) son de tests que prueban caminos de error y pasan.
4. **Estado de git:** `git status` de `Stockly-B` sigue en `?? docs/auditoria/`.

La base de desarrollo `stockly` no se tocó: sigue sin las migraciones T5-14 y T5-15.

## No se pudo completar
- Código de salida no capturado en 2a (`prisma generate`) y 2b (`prisma migrate status`): el comando del encargo no incluía `echo exit`. La salida no muestra error.
- Duración no medida en 2c, 2i y 3f. Sí se midió en el resto.
- Ningún comando quedó sin ejecutar. No se ejecutó nada de la lista prohibida (`pnpm verify`, `pnpm install`, migraciones de escritura, seed, reset, E2E, `--fix`/`--write`/`--informe`).
