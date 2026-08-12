/**
 * T3-05 — este escapado está **duplicado literalmente** en
 * `Stockly-F/src/modules/products/utils/importExport.ts:escapeCsvField`, comentario
 * incluido. No es un descuido: los dos repositorios no comparten paquete, y el frontend
 * arma su propio CSV en el navegador a partir del JSON.
 *
 * La duplicación se declara aquí para que quien toque una de las dos copias sepa que
 * existe la otra. Lo que impide que se separen es que ambos repositorios fijan en un test
 * la misma cabecera de once columnas: `export-streaming.test.ts` de este lado,
 * `importExport.test.ts` del otro.
 */
export function escapeCsvCell(value: unknown): string {
    const str = value === null || value === undefined ? "" : String(value);
    // Previene inyección de fórmulas (CSV injection): una celda que empieza con
    // = + - @ tab o retorno de carro puede ejecutarse como fórmula en Excel/Sheets.
    // Se antepone un apóstrofo para que el gestor la trate como texto literal.
    const guarded = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    if (guarded.includes('"') || guarded.includes(",") || guarded.includes("\n")) {
        return `"${guarded.replace(/"/g, '""')}"`;
    }
    return guarded;
}

/**
 * **Ya no la llama ningún endpoint, y no es un descuido.** T2-05 pasó las exportaciones
 * grandes al escritor por lotes de `exportacion.ts`, y T4-15 se llevó la última que
 * quedaba —la del histórico de un producto—. Lo que sigue haciendo es de **oráculo**:
 * `export-streaming.test.ts` compara byte a byte el CSV que produce el escritor por lotes
 * con el que produce esto sobre el conjunto completo. Es lo que garantiza que transmitir
 * por partes no cambie ni una coma del archivo.
 *
 * Si algún día se borra, hay que sustituir esa comparación por otra cosa —no basta con
 * quitar el test—, porque es la única que ata el formato de las dos rutas.
 */
export function buildCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]!);
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
    ];
    return lines.join("\n");
}
