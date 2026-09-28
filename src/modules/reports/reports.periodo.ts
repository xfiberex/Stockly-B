import { HttpError } from "@/shared/lib/httpError";

/**
 * T5-09 — qué días abarca un informe por periodo.
 *
 * Un periodo son **días de calendario del negocio**, `from` y `to` incluidos, en `YYYY-MM-DD`.
 * Aquí no hay horas ni zonas: «marzo» es `2026-03-01`–`2026-03-31`, y dónde empieza y acaba
 * cada uno de esos días lo decide la consulta con la zona del negocio (`AT TIME ZONE`). Por eso
 * todo se calcula con aritmética de fechas en UTC, que no tiene cambios de hora que la tuerzan.
 */

export const ATAJOS_DE_PERIODO = ["this-month", "last-month", "this-quarter", "this-year"] as const;
export type AtajoDePeriodo = (typeof ATAJOS_DE_PERIODO)[number];

/**
 * Techo del rango. Cinco años son 60 filas en el desglose por meses y un recorrido acotado de
 * las ventas; sin techo, `from=1900-01-01` generaría 1 500 meses vacíos que alguien pidió por
 * error. El atajo más largo es un año, así que el techo solo lo alcanza un rango a mano.
 */
export const MESES_MAXIMOS_DE_PERIODO = 60;

export interface Periodo {
    from: string;
    to: string;
    /** El atajo que lo produjo, o `null` si se pidió con fechas. */
    preset: AtajoDePeriodo | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function aFecha(texto: string): Date {
    const [y, m, d] = texto.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function aTexto(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

/** Último día del mes `mes` (1–12) de `anio`: el día 0 del mes siguiente. */
function finDeMes(anio: number, mes: number): Date {
    return new Date(Date.UTC(anio, mes, 0));
}

/** `2026-02-30` casa con el patrón y no existe; `Date.UTC` lo pasaría a marzo sin avisar. */
function fechaValida(campo: string, valor: unknown): string {
    if (typeof valor !== "string" || !FECHA.test(valor) || aTexto(aFecha(valor)) !== valor) {
        throw new HttpError(
            400,
            `El filtro «${campo}» no es una fecha válida: «${String(valor)}». Formato esperado: AAAA-MM-DD.`,
            "INVALID_FILTER_VALUE",
        );
    }
    return valor;
}

/** Los días del atajo, contados desde `hoy`, que es «hoy» **en la zona del negocio**. */
export function periodoDeAtajo(atajo: AtajoDePeriodo, hoy: string): Periodo {
    const [anio, mes] = hoy.split("-").map(Number);
    const inicioDeMes = (a: number, m: number) => new Date(Date.UTC(a, m - 1, 1));

    switch (atajo) {
        case "this-month":
            return { from: aTexto(inicioDeMes(anio, mes)), to: aTexto(finDeMes(anio, mes)), preset: atajo };
        case "last-month": {
            // `Date.UTC` con mes 0 da diciembre del año anterior: enero no es un caso aparte.
            const anterior = new Date(Date.UTC(anio, mes - 2, 1));
            const a = anterior.getUTCFullYear();
            const m = anterior.getUTCMonth() + 1;
            return { from: aTexto(anterior), to: aTexto(finDeMes(a, m)), preset: atajo };
        }
        case "this-quarter": {
            const primerMes = Math.floor((mes - 1) / 3) * 3 + 1;
            return { from: aTexto(inicioDeMes(anio, primerMes)), to: aTexto(finDeMes(anio, primerMes + 2)), preset: atajo };
        }
        case "this-year":
            return { from: `${anio}-01-01`, to: `${anio}-12-31`, preset: atajo };
    }
}

/**
 * El periodo de la petición: un atajo, o `from` y `to`. Sin nada, **este mes**, que es la
 * pregunta más habitual y lo que enseña la pantalla al abrirse. Las dos formas a la vez son un
 * error y no una preferencia: no hay forma de adivinar cuál de las dos quería quien llama.
 */
export function resolverPeriodo(query: { preset?: unknown; from?: unknown; to?: unknown }, hoy: string): Periodo {
    const { preset, from, to } = query;

    if (preset !== undefined) {
        if (from !== undefined || to !== undefined) {
            throw new HttpError(400, "Se pide un atajo o un rango de fechas, no las dos cosas.", "INVALID_FILTER_VALUE");
        }
        if (typeof preset !== "string" || !(ATAJOS_DE_PERIODO as readonly string[]).includes(preset)) {
            throw new HttpError(
                400,
                `El filtro «preset» no admite el valor «${String(preset)}». Valores válidos: ${ATAJOS_DE_PERIODO.join(", ")}.`,
                "INVALID_FILTER_VALUE",
            );
        }
        return periodoDeAtajo(preset as AtajoDePeriodo, hoy);
    }

    if (from === undefined && to === undefined) return periodoDeAtajo("this-month", hoy);

    const desde = fechaValida("from", from);
    const hasta = fechaValida("to", to);
    if (desde > hasta) {
        throw new HttpError(400, `El periodo empieza (${desde}) después de terminar (${hasta}).`, "INVALID_FILTER_VALUE");
    }

    const [a1, m1] = desde.split("-").map(Number);
    const [a2, m2] = hasta.split("-").map(Number);
    if ((a2 - a1) * 12 + (m2 - m1) + 1 > MESES_MAXIMOS_DE_PERIODO) {
        throw new HttpError(
            400,
            `El periodo abarca más de ${MESES_MAXIMOS_DE_PERIODO} meses. Pide uno más corto.`,
            "INVALID_FILTER_VALUE",
        );
    }

    return { from: desde, to: hasta, preset: null };
}

/** Los meses que toca el periodo, `YYYY-MM`, del primero al último, incluidos. */
export function mesesDe(from: string, to: string): string[] {
    const meses: string[] = [];
    const [a1, m1] = from.split("-").map(Number);
    const [a2, m2] = to.split("-").map(Number);
    for (let i = a1 * 12 + (m1 - 1); i <= a2 * 12 + (m2 - 1); i++) {
        meses.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    }
    return meses;
}
