-- T6-08 — rol de vendedor y venta de mostrador. Al final de cada enum, que es donde los pone
-- el esquema. Dos sentencias y nada más: un valor añadido a un enum no se puede usar en la
-- misma transacción que lo crea, y esta migración no lo usa.
ALTER TYPE "Role" ADD VALUE 'SELLER' AFTER 'WAREHOUSE';
ALTER TYPE "AuditAction" ADD VALUE 'SALE_COUNTER' AFTER 'COUNT_CANCEL';
