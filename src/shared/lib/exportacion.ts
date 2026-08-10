import type { Response } from "express";
import { escapeCsvCell } from "@/shared/lib/csv";
import { HttpError } from "@/shared/lib/httpError";

/**
 * T2-05 — exportaciones por lotes y en streaming.
 *
 * Las tres exportaciones (productos, órdenes de venta y de compra) cargaban su tabla
 * entera con un `findMany` sin `take` y `buildCsv` concatenaba **todo el archivo en una
 * sola cadena** antes de enviarlo. El proceso llegaba a tener a la vez las filas de
 * Prisma, el array de objetos y el texto completo del CSV: tres copias del mismo
 * catálogo, y todas vivas hasta que la respuesta terminaba.
 *
 * Aquí el servicio entrega **lotes** y esto los escribe según llegan, así que en memoria
 * solo hay un lote cada vez, sea cual sea el tamaño de la tabla.
 */

/**
 * Filas por consulta. **Es el parámetro que fija el techo de memoria**, no un detalle de
 * ajuste: medido sobre 50 000 productos con el heap limitado a 48 MB, 500 y 1000 caben
 * (pico 42.6 y 46.4 MB) y **2000 y 5000 se quedan sin memoria**.
 *
 * Se elige 500 y no 1000 aunque 1000 sea un 25 % más rápido (3151 ms frente a 4272): la
 * tarea va de acotar la memoria, y 1000 deja el pico a 2 MB del límite. Una exportación
 * es una descarga en segundo plano; el segundo que se gana no compensa medio margen.
 */
export const TAM_LOTE_EXPORTACION = 500;

/**
 * Tope duro, la red de seguridad que pedía la ficha. Es un límite de **filas del
 * archivo**, no de registros: una orden con veinte líneas son veinte filas.
 */
export const MAX_FILAS_EXPORTACION =
    Number.parseInt(process.env.EXPORT_MAX_ROWS ?? "", 10) || 100_000;

/**
 * Marca de orden de bytes (T2-34). Va solo en el CSV: en JSON sería un error de sintaxis
 * para cualquier analizador estricto, y ahí nadie la necesita.
 */
export const BOM = "\uFEFF";

interface OpcionesDeExportacion {
    /** `csv` o cualquier otra cosa, que se interpreta como JSON. */
    formato: string | undefined;
    nombreArchivo: string;
    mensaje: string;
    /** Filas que va a tener el archivo, para poder rechazar **antes** de escribir nada. */
    total: number;
    lotes: AsyncIterable<Array<Record<string, unknown>>>;
}

/**
 * Escribe respetando la contrapresión.
 *
 * Sin esto, escribir en bucle sobre una respuesta más lenta que la base acumula en el
 * búfer del socket justamente lo que se quería evitar tener en memoria: el archivo
 * entero. `res.write` devuelve `false` cuando el búfer está lleno; se espera a `drain`.
 */
function escribir(res: Response, texto: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (res.write(texto)) return resolve();
        const alDrenar = () => { res.off("error", alFallar); resolve(); };
        const alFallar = (err: Error) => { res.off("drain", alDrenar); reject(err); };
        res.once("drain", alDrenar);
        res.once("error", alFallar);
    });
}

export async function enviarExportacion(
    res: Response,
    { formato, nombreArchivo, mensaje, total, lotes }: OpcionesDeExportacion,
): Promise<void> {
    // El tope se comprueba **antes** de escribir el primer byte. Una vez enviada la
    // cabecera ya no se puede responder un error: solo quedaría cortar el archivo por
    // la mitad, y el usuario se llevaría una exportación incompleta creyéndola buena.
    if (total > MAX_FILAS_EXPORTACION) {
        throw new HttpError(
            413,
            `La exportación tiene ${total} filas y el máximo es ${MAX_FILAS_EXPORTACION}. Filtra antes de exportar.`,
            "EXPORT_TOO_LARGE",
            { filas: total, maximo: MAX_FILAS_EXPORTACION },
        );
    }

    if (formato === "csv") {
        // T2-34 — `charset=utf-8` explícito y marca de orden de bytes.
        //
        // Sin el `charset`, un cliente que no lo asuma decodifica con su página de
        // códigos; y Excel en Windows ni siquiera mira la cabecera: si el archivo no
        // empieza por `U+FEFF` lo abre en ANSI y «Electrónica» se ve «ElectrÃ³nica».
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=${nombreArchivo}.csv`);

        let cabeceras: string[] | null = null;
        for await (const lote of lotes) {
            for (const fila of lote) {
                // La cabecera sale de la primera fila, igual que en `buildCsv`. Sin
                // filas no se escribe nada, que es lo que devolvía antes para vacío.
                if (!cabeceras) {
                    cabeceras = Object.keys(fila);
                    await escribir(res, BOM + cabeceras.join(","));
                }
                await escribir(res, "\n" + cabeceras.map((h) => escapeCsvCell(fila[h])).join(","));
            }
        }
        res.end();
        return;
    }

    // El JSON se transmite igual. Se construye a mano porque `res.json` serializa el
    // objeto completo, que es exactamente la copia en memoria que se quiere evitar.
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    await escribir(res, `{"success":true,"message":${JSON.stringify(mensaje)},"data":[`);

    let primera = true;
    for await (const lote of lotes) {
        for (const fila of lote) {
            await escribir(res, (primera ? "" : ",") + JSON.stringify(fila));
            primera = false;
        }
    }
    await escribir(res, "]}");
    res.end();
}
