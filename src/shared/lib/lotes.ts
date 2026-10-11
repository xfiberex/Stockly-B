import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { hoyEn } from "@/shared/lib/zonaHoraria";
import { settingsService } from "@/modules/settings/settings.service";
import { DIAS_DE_AVISO_DE_CADUCIDAD_MAXIMOS, DIAS_DE_AVISO_DE_CADUCIDAD_POR_DEFECTO, codigoDeLotePorDefecto } from "@/contratos/api";

/**
 * T5-15 — lotes y fechas de caducidad: lo que no es mover unidades.
 *
 * Mover unidades —de qué lote sale cada una— es de `shared/lib/stock.ts`. Aquí está lo que va
 * antes: **qué día es hoy** para decidir si algo ha caducado, y **a qué lote va una entrada**.
 */

type Tx = Prisma.TransactionClient;

/**
 * Hoy, `AAAA-MM-DD`, **en la zona del negocio**. Un lote caduca al terminar su fecha allí, no en
 * UTC ni en el navegador de quien mira: a las 21:00 del día 5 en Santo Domingo ya es día 6 en
 * UTC, y el lote que vence el 5 todavía se puede vender.
 */
export async function hoyDelNegocio(ahora: Date = new Date()): Promise<string> {
    return hoyEn(await settingsService.zonaHoraria(), ahora);
}

/**
 * Con cuántos días de antelación se avisa de una caducidad: el ajuste `expiryWarningDays`,
 * siempre un entero utilizable. Una fila editada a mano con `abc` no puede acabar en una fecha.
 */
export async function diasDeAvisoDeCaducidad(): Promise<number> {
    const dias = Number(await settingsService.get("expiryWarningDays"));
    const valido = Number.isInteger(dias) && dias >= 0 && dias <= DIAS_DE_AVISO_DE_CADUCIDAD_MAXIMOS;
    return valido ? dias : DIAS_DE_AVISO_DE_CADUCIDAD_POR_DEFECTO;
}

/** Una columna `date` como la devuelve Prisma —medianoche UTC de ese día—, a `AAAA-MM-DD`. */
export function aDia(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

/** Días que faltan de `hoy` a `dia`, los dos `AAAA-MM-DD`. Negativo si ya pasó. */
export function diasHasta(dia: string, hoy: string): number {
    return Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

/** Lo que una petición puede decir del lote de una entrada. */
export interface LoteDeLaPeticion {
    /** Un lote que ya existe. */
    lotId?: string | null;
    /** O uno por su fecha de caducidad, `AAAA-MM-DD`, y —si se quiere— su código. */
    expiresAt?: string | null;
    lotCode?: string | null;
}

export function loteNoEncontrado(): HttpError {
    return new HttpError(404, "Lote no encontrado", "LOT_NOT_FOUND");
}

/** El lote `lotId` de un producto, o 404: el de otro producto no existe para este. */
export async function loteDelProducto(tx: Tx, productId: string, lotId: string) {
    const lote = await tx.lot.findFirst({ where: { id: lotId, productId } });
    if (!lote) throw loteNoEncontrado();
    return lote;
}

/**
 * A qué lote va una **entrada** de `producto`: devuelve su id, o `null` si el producto no lleva
 * lotes. Tiene que llamarse **con el producto ya bloqueado**: es lo que hace que dos entradas
 * simultáneas del mismo lote nuevo no lo creen dos veces.
 *
 * - Un producto que **no lleva lotes** no admite que se le diga uno: se rechaza en vez de
 *   guardarlo, porque nadie lo vería después.
 * - Uno que **sí** los lleva exige la fecha de caducidad —o un lote que ya exista—. El código
 *   es opcional: sin él, sale de la fecha (`codigoDeLotePorDefecto`), así que dos entradas sin
 *   código que caducan el mismo día van al mismo lote.
 * - Un código que **ya existe con otra fecha** se rechaza: el mismo lote no caduca dos días
 *   distintos, y lo más probable es una fecha mal tecleada.
 * - **No entra mercancía ya caducada.** Sumar a un lote que ya existe y está vencido sí vale
 *   —es lo que hace la cancelación de una venta al devolver lo suyo—, pero eso llega con
 *   `lotId`, no con una fecha.
 */
export async function loteDeEntrada(
    tx: Tx,
    producto: { id: string; name: string; tracksLots: boolean },
    lote: LoteDeLaPeticion,
    hoy: string,
): Promise<string | null> {
    const dice = Boolean(lote.lotId || lote.expiresAt || lote.lotCode);

    if (!producto.tracksLots) {
        if (dice) {
            throw new HttpError(400, `"${producto.name}" no lleva lotes`, "PRODUCT_WITHOUT_LOTS", { producto: producto.name });
        }
        return null;
    }

    if (lote.lotId) return (await loteDelProducto(tx, producto.id, lote.lotId)).id;

    if (!lote.expiresAt) {
        throw new HttpError(
            400,
            `"${producto.name}" lleva lotes: indica la fecha de caducidad de lo que entra`,
            "LOT_EXPIRY_REQUIRED",
            { producto: producto.name },
        );
    }
    if (lote.expiresAt < hoy) {
        throw new HttpError(
            400,
            `No se puede dar entrada a "${producto.name}" con caducidad ${lote.expiresAt}: ya ha pasado`,
            "LOT_ALREADY_EXPIRED",
            { producto: producto.name, caducidad: lote.expiresAt },
        );
    }

    const code = lote.lotCode?.trim() || codigoDeLotePorDefecto(lote.expiresAt);

    // Crear o encontrar en una sentencia: el índice único decide, y no hay lectura previa que
    // otra petición pueda adelantar. El `DO UPDATE` no cambia nada; está para que `RETURNING`
    // devuelva también la fila que ya existía.
    const [fila] = await tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`
        INSERT INTO lots (id, "productId", code, "expiresAt")
        VALUES (gen_random_uuid()::text, ${producto.id}, ${code}, ${lote.expiresAt}::date)
        ON CONFLICT ("productId", code) DO UPDATE SET code = EXCLUDED.code
        RETURNING id, "expiresAt"`;

    const guardada = aDia(fila!.expiresAt);
    if (guardada !== lote.expiresAt) {
        throw new HttpError(
            409,
            `El lote ${code} de "${producto.name}" ya existe y caduca el ${guardada}, no el ${lote.expiresAt}`,
            "LOT_EXPIRY_MISMATCH",
            { producto: producto.name, lote: code, caducidad: guardada },
        );
    }
    return fila!.id;
}
