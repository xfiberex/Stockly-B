-- T2-31 — detección de reuso de refresh tokens.
--
-- Guarda el hash del refresh token que se acaba de rotar. Si vuelve a presentarse uno
-- que ya no está en `refreshToken` pero sí aquí, es que alguien está reutilizando un
-- token gastado: se cierran todas las sesiones del usuario y se registra en la auditoría.
--
-- Escrita a mano: `prisma migrate dev --create-only` no puede ejecutarse aquí sin TTY.
ALTER TABLE "users" ADD COLUMN "previousRefreshToken" TEXT;

-- Único como `refreshToken`: la búsqueda por este campo tiene que ser puntual, y dos
-- usuarios no pueden compartir el mismo hash.
CREATE UNIQUE INDEX "users_previousRefreshToken_key" ON "users"("previousRefreshToken");
