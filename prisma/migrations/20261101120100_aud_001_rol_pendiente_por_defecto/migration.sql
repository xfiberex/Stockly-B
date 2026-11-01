-- AUD-001 — una cuenta creada sin decir su rol nace sin ninguno. El registro ya lo pone a
-- mano; esto cubre cualquier otro `INSERT` que se olvide de hacerlo. Las cuentas que ya
-- existen conservan el suyo.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'PENDING';
