import { prisma } from "@/shared/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Cliente = Prisma.TransactionClient | typeof prisma;

/** La fila de `counters` que lleva la serie de las compras. */
export const CONTADOR_DE_COMPRAS = "purchaseOrder";

/**
 * AUD-019 — el número que le toca a la compra que se está creando. Es el gemelo de
 * `siguienteNumeroDeVenta` (`numeroDeVenta.ts`), con su propia serie, y valen sus mismas razones:
 *
 * **Hay que llamarlo dentro de la transacción que crea la orden.** El `UPDATE` bloquea la fila
 * del contador hasta que esa transacción termina: dos compras simultáneas no comparten número, y
 * si la transacción se deshace —generar desde sugerencias crea varias órdenes y falla una—, el
 * incremento se deshace con ella. Una secuencia de PostgreSQL habría gastado el número.
 *
 * La fila la deja puesta la migración. Si no está —la base de tests, o una recién limpiada—, la
 * rama del `INSERT` arranca en la última orden que haya, y no puede repetir un número ya dado.
 */
export async function siguienteNumeroDeCompra(tx: Cliente): Promise<number> {
    const [fila] = await tx.$queryRaw<Array<{ value: number }>>`
        INSERT INTO "counters" ("key", "value")
        SELECT ${CONTADOR_DE_COMPRAS}, COALESCE(MAX("number"), 0) + 1 FROM "purchase_orders"
        ON CONFLICT ("key") DO UPDATE SET "value" = "counters"."value" + 1
        RETURNING "value"`;
    return fila!.value;
}
