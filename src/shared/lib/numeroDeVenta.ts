import { prisma } from "@/shared/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";

type Cliente = Prisma.TransactionClient | typeof prisma;

/** La fila de `counters` que lleva la serie de las ventas. */
export const CONTADOR_DE_VENTAS = "saleOrder";

/**
 * T6-04 — el número que le toca a la venta que se está creando.
 *
 * **Hay que llamarlo dentro de la transacción que crea la orden.** El `UPDATE` bloquea la fila
 * del contador hasta que esa transacción termina, y de eso salen las dos garantías:
 *
 * - Dos ventas simultáneas no pueden recibir el mismo número: la segunda espera a la primera.
 * - Si la transacción se deshace —la venta pide más de lo disponible y sale con 409—, el
 *   incremento se deshace con ella y el número no se gasta. Con una secuencia de PostgreSQL
 *   se habría gastado: `nextval` no participa en el `ROLLBACK`.
 *
 * El precio es que las ventas se crean de una en una. Es lo que se quiere de una serie sin
 * huecos, y crear una venta son milisegundos.
 *
 * La fila la deja puesta la migración. Si no está —una base levantada con `prisma db push`,
 * como la de tests, o recién limpiada—, la rama del `INSERT` arranca en la última orden que
 * haya: un contador que faltara no puede repetir un número ya dado.
 */
export async function siguienteNumeroDeVenta(tx: Cliente): Promise<number> {
    const [fila] = await tx.$queryRaw<Array<{ value: number }>>`
        INSERT INTO "counters" ("key", "value")
        SELECT ${CONTADOR_DE_VENTAS}, COALESCE(MAX("number"), 0) + 1 FROM "sale_orders"
        ON CONFLICT ("key") DO UPDATE SET "value" = "counters"."value" + 1
        RETURNING "value"`;
    return fila!.value;
}

/** El mayor entero que cabe en la columna (`INTEGER` de PostgreSQL). */
const MAXIMO = 2_147_483_647;

/**
 * El filtro `?number=` del listado: solo dígitos. Con ceros a la izquierda vale —es como se
 * enseña el número—; con `#`, con letras o repetido, es un 400 y no un listado vacío, que se
 * leería como «esa venta no existe».
 */
export function numeroDeVentaDelFiltro(valor: unknown): number | undefined {
    if (valor === undefined || valor === "") return undefined;

    if (typeof valor !== "string" || !/^\d+$/.test(valor) || Number(valor) > MAXIMO) {
        throw new HttpError(
            400,
            `El filtro «number» no es un número de venta: «${String(valor)}». Solo dígitos.`,
            "INVALID_FILTER_VALUE",
        );
    }
    return Number(valor);
}
