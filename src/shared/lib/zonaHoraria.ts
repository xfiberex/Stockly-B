/**
 * T5-09 — la zona horaria del negocio: dónde empieza «marzo».
 *
 * Es un ajuste de la aplicación (`timezone`), no la del navegador de quien pregunta. Con la del
 * navegador, dos personas en zonas distintas verían cifras distintas para el mismo mes, y lo que
 * se genera sin navegador —el PDF, el CSV, el resumen por correo de T5-11— no tendría ninguna.
 *
 * Las fechas se guardan en UTC (`timestamp` sin zona, como las escribe Prisma). La conversión
 * la hace PostgreSQL con `AT TIME ZONE`, que conoce los cambios de horario; aquí solo se valida
 * el nombre y se calcula «hoy».
 */

/** República Dominicana: UTC−4 todo el año, sin horario de verano. */
export const ZONA_HORARIA_POR_DEFECTO = "America/Santo_Domingo";

/**
 * El nombre IANA en su forma canónica (`america/santo_domingo` → `America/Santo_Domingo`), o
 * `null` si no es una zona. Se valida con `Intl` porque es lo que usa después `hoyEn`; un
 * nombre que `Intl` no conoce tampoco serviría para calcular los atajos de periodo.
 */
export function zonaHorariaCanonica(valor: string): string | null {
    if (!valor.trim()) return null;
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: valor }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
}

/**
 * La fecha de hoy **en la zona dada**, como `YYYY-MM-DD`. A las 22:00 del 31 de marzo en Santo
 * Domingo ya es 1 de abril en UTC; «este mes» tiene que seguir siendo marzo.
 */
export function hoyEn(zona: string, ahora: Date = new Date()): string {
    // `en-CA` formatea como `YYYY-MM-DD`, que es justo el formato que se quiere.
    return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
