-- T2-09 — búsqueda por nombre con índice de trigramas.
--
-- `{ contains, mode: "insensitive" }` de Prisma se traduce a `ILIKE '%término%'`. Un
-- B-tree no sirve para un patrón que no empieza por prefijo, así que la búsqueda del
-- catálogo recorría la tabla entera. `pg_trgm` parte el texto en trigramas y los indexa
-- con GIN, que sí resuelve el patrón con comodín por delante.
--
-- La extensión la crea esta migración: Prisma no la declara en el esquema, y sin ella
-- `gin_trgm_ops` no existe y las tres creaciones de índice fallan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "users_name_idx" ON "users" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users" USING GIN ("email" gin_trgm_ops);
