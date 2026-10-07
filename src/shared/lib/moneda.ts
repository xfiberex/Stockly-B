import { escribirImporte } from "@/contratos/api";

/**
 * Un importe como lo escribe la aplicación fuera del navegador: `RD$14,999.00`.
 *
 * El formato es el de `escribirImporte`, en el contrato, que es también el del frontend. Vivía
 * copiado en el PDF de reportes y en las etiquetas; el resumen semanal (T5-11) habría sido la
 * tercera copia.
 *
 * T6-03 — **`simbolo` es obligatorio y no tiene valor por defecto**, como el `idioma` de los
 * correos: con uno, un PDF nuevo que olvidara pedir la moneda compilaría y saldría en `$`. Lo da
 * `settingsService.moneda()`, una vez por documento.
 */
export function formatearImporte(n: number, simbolo: string, opciones: { decimales?: number } = {}): string {
    return escribirImporte(n, simbolo, opciones);
}
