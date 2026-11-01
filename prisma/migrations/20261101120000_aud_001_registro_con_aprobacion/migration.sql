-- AUD-001 — el registro público deja la cuenta sin rol hasta que un administrador le asigna
-- uno, y avisa a los administradores en la campana. Solo los valores nuevos: un valor añadido a
-- un enum no se puede usar en la misma transacción que lo crea, así que el valor por defecto de
-- la columna va en la migración siguiente.
--
-- Expansiva: el código anterior sigue funcionando contra la base migrada, porque no conoce
-- ninguno de los dos valores y ninguna fila los tiene todavía.
ALTER TYPE "Role" ADD VALUE 'PENDING' AFTER 'SELLER';
ALTER TYPE "NotificationType" ADD VALUE 'USER_PENDING' AFTER 'LOT_EXPIRING';
