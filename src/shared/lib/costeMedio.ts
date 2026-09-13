import { Prisma } from "@/generated/prisma/client";

/** Los decimales de `Product.costPrice` y `CostHistory` (`Decimal(12, 4)`). */
export const DECIMALES_DE_COSTE = 4;

type Importe = Prisma.Decimal | number | string;

/**
 * T5-01 — el coste medio ponderado tras recibir `cantidad` unidades a `costeUnitario`.
 *
 * `stockAntes` es el stock **anterior** a la recepción y `costeAntes` el coste medio que
 * tenía el producto, `null` si nunca se supo. Tres reglas, cada una con su test:
 *
 * - **Sin coste previo, la recepción fija el coste.** Promediar con cero diría que las
 *   unidades que ya había no costaron nada, y bajaría la media a la mitad sin motivo.
 * - **Con stock a cero o negativo, el coste anterior no pesa.** No quedan unidades a las que
 *   aplicarlo; un stock negativo, además, daría un peso negativo y una media absurda.
 * - En el resto, `(stock × coste + cantidad × costeUnitario) / (stock + cantidad)`.
 *
 * Se calcula en `Decimal` y no en `number`: es dinero, y se redondea una sola vez al final,
 * a los decimales de la columna.
 */
export function costeMedioTrasRecepcion(
    stockAntes: number,
    costeAntes: Importe | null,
    cantidad: number,
    costeUnitario: Importe,
): Prisma.Decimal {
    const unitario = new Prisma.Decimal(costeUnitario);

    if (costeAntes === null || stockAntes <= 0) {
        return unitario.toDecimalPlaces(DECIMALES_DE_COSTE);
    }

    const valorAntes = new Prisma.Decimal(costeAntes).mul(stockAntes);
    const valorRecibido = unitario.mul(cantidad);

    return valorAntes
        .add(valorRecibido)
        .div(stockAntes + cantidad)
        .toDecimalPlaces(DECIMALES_DE_COSTE);
}

/** Dos costes son el mismo si coinciden a los decimales de la columna; `null` solo con `null`. */
export function mismoCoste(a: Importe | null, b: Importe | null): boolean {
    if (a === null || b === null) return a === b;
    return new Prisma.Decimal(a).toDecimalPlaces(DECIMALES_DE_COSTE).equals(new Prisma.Decimal(b).toDecimalPlaces(DECIMALES_DE_COSTE));
}
