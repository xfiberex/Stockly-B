/**
 * Un importe como lo escribe la aplicación fuera del navegador: `$14,999.00`.
 *
 * Es el mismo formato que `formatearImporte` del frontend (`es-MX`, dos decimales). Vivía
 * copiado en el PDF de reportes y en las etiquetas; el resumen semanal (T5-11) habría sido la
 * tercera copia.
 */
export function formatearImporte(n: number): string {
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
