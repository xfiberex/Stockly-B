/**
 * T5-06 — la forma en la que se guarda y se compara el correo de un cliente: minúsculas y sin
 * espacios alrededor. `null` si no queda nada.
 *
 * Es **la clave del cliente**, y la usan tres sitios que tienen que coincidir: la migración que
 * agrupó las órdenes antiguas (`LOWER(BTRIM(...))`), el alta y la edición de un cliente, y la
 * venta que se vincula sola por su correo. Si uno normalizase distinto, `Ana@Correo.com` y
 * `ana@correo.com` acabarían siendo dos clientes.
 */
export function normalizarCorreo(correo: string | null | undefined): string | null {
    const limpio = correo?.trim().toLowerCase();
    return limpio ? limpio : null;
}
