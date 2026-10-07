import { Prisma } from "@/generated/prisma/client";

/** Lo que hace falta de una línea para saber cuánto suma. */
interface LineaDeVenta {
    quantity: number;
    unitPrice: Prisma.Decimal;
    /** El porcentaje congelado al crear la orden. `null` en las anteriores a T6-05: sin impuesto. */
    taxRate: Prisma.Decimal | null;
}

const CERO = new Prisma.Decimal(0);

/**
 * T6-05 — cuánto suma una línea de venta. **El redondeo se decide aquí y solo aquí.**
 *
 * - `subtotal` es cantidad × precio, **sin impuesto**. No se redondea: `unitPrice` tiene dos
 *   decimales y la cantidad es entera, así que ya es exacto.
 * - `tax` se redondea **por línea**, a dos decimales y con el medio hacia arriba —`0,005` es
 *   `0,01`—, que es como se redondea el dinero en un comprobante. El impuesto de la orden es la
 *   suma de los de sus líneas, no el porcentaje del subtotal: así lo que dice cada línea y lo
 *   que dice el pie siempre cuadran, que es lo que alguien comprueba con una calculadora.
 *
 * Con `Decimal`, no con `number`: `0.1 + 0.2` no es `0.3`, y esto acaba en un comprobante.
 */
export function totalesDeLinea(linea: LineaDeVenta) {
    const subtotal = linea.unitPrice.mul(linea.quantity);
    const tax = linea.taxRate
        ? subtotal.mul(linea.taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : CERO;
    return { subtotal, tax, total: subtotal.add(tax) };
}

/**
 * T6-05 — la orden con sus importes calculados, como la devuelve la API.
 *
 * Los tres totales **no se guardan**: salen de lo que sí está congelado en cada línea —la
 * cantidad, el precio y la tasa—, así que no hay una segunda copia que pueda decir otra cosa.
 * Y no los manda nadie: `createSaleOrderSchema` descarta cualquier `total` que venga en el cuerpo.
 *
 * `taxRate` sale como número (`18`, `7.5`) porque es un porcentaje, no un importe.
 */
export function conTotales<L extends LineaDeVenta, O extends { items: L[] }>(orden: O) {
    let subtotal = CERO;
    let tax = CERO;

    // Se separan las líneas del resto para que el tipo de vuelta diga la verdad: con
    // `{ ...orden, items }` TypeScript cruzaba las líneas nuevas con las de entrada.
    const { items: lineas, ...resto } = orden;
    const items = lineas.map((item) => {
        const linea = totalesDeLinea(item);
        subtotal = subtotal.add(linea.subtotal);
        tax = tax.add(linea.tax);
        return {
            ...item,
            taxRate: item.taxRate === null ? null : item.taxRate.toNumber(),
            subtotal: linea.subtotal.toFixed(2),
            tax: linea.tax.toFixed(2),
            total: linea.total.toFixed(2),
        };
    });

    return { ...resto, items, subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: subtotal.add(tax).toFixed(2) };
}
