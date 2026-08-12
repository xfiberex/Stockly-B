// @ts-expect-error — `scripts/` es utillaje en JS plano, sin tipos y fuera de `src`.
import { leerVersionDeCabecera, evaluarCompatibilidad } from "../../scripts/postgres.js";

/**
 * T4-13 — el guardia que impide restaurar un volcado en un servidor más antiguo.
 *
 * Existe porque el fallo real llega tarde y disfrazado: `pg_restore` revienta a mitad de la
 * restauración, con la base de destino **ya borrada**, y el error habla de un parámetro de
 * configuración desconocido sin mencionar ninguna versión.
 *
 * Y estos tests existen porque **el guardia ya salió mal una vez**: el patrón de la cabecera
 * se escribió sin los dos puntos, no reventó —se degradó a «no se puede saber»— y dejó pasar
 * la restauración. Una comprobación que no comprueba nada tiene exactamente ese aspecto
 * desde fuera, así que se fija con la salida literal de `pg_restore -l`.
 */

// Copiada tal cual de `pg_restore -l` sobre un volcado real de este proyecto.
const CABECERA_REAL = `;
; Archive created at 2026-08-12 11:35:00
;     dbname: Stockly
;     TOC Entries: 106
;     Compression: gzip
;     Dump Version: 1.16-0
;     Format: CUSTOM
;     Integer: 4 bytes
;     Offset: 8 bytes
;     Dumped from database version: 17.10
;     Dumped by pg_dump version: 17.10
;`;

describe("Versión de un volcado (T4-13)", () => {
    it("la lee de la cabecera real de `pg_restore -l`", () => {
        expect(leerVersionDeCabecera(CABECERA_REAL)).toBe(17);
    });

    it("no confunde la del servidor con la de `pg_dump`", () => {
        // Las dos líneas son casi iguales y van seguidas. La que importa es la primera: un
        // cliente 18 puede volcar de un servidor 17, y lo que decide si la restauración
        // entra es la del **servidor de origen**.
        const mezclada = CABECERA_REAL.replace("Dumped by pg_dump version: 17.10", "Dumped by pg_dump version: 18.1");
        expect(leerVersionDeCabecera(mezclada)).toBe(17);
    });

    it("acepta la forma sin dos puntos, por si cambia el formato", () => {
        expect(leerVersionDeCabecera(";     Dumped from database version 16.14")).toBe(16);
    });

    it("devuelve null si la línea no está, en vez de inventarse un número", () => {
        expect(leerVersionDeCabecera(";     Format: CUSTOM")).toBeNull();
        expect(leerVersionDeCabecera("")).toBeNull();
        expect(leerVersionDeCabecera(undefined)).toBeNull();
    });
});

describe("Compatibilidad de versiones al restaurar (T4-13)", () => {
    it("hacia atrás **no**: un volcado de 17 en un servidor 16 se bloquea", () => {
        // Es el caso que motivó la tarea, y está comprobado además contra un
        // `postgres:16-alpine` de verdad: el guion aborta antes de crear la base de destino.
        expect(evaluarCompatibilidad(17, 16).estado).toBe("fallo");
    });

    it("hacia adelante sí: uno de 16 entra en un servidor 17", () => {
        // Esta es la dirección que hace que subir la imagen del compose sea la decisión
        // correcta y no solo «la más nueva».
        expect(evaluarCompatibilidad(16, 17).estado).toBe("correcto");
    });

    it("la misma versión, obviamente", () => {
        expect(evaluarCompatibilidad(17, 17).estado).toBe("correcto");
    });

    it("si falta cualquiera de las dos, avisa en vez de bloquear", () => {
        // Mismo criterio que la auditoría de dependencias (T4-07): «no se puede saber» no es
        // «hay un problema». Una puerta que se cierra sin motivo el día de la recuperación
        // es peor que no tenerla.
        expect(evaluarCompatibilidad(null, 17).estado).toBe("indeterminado");
        expect(evaluarCompatibilidad(17, null).estado).toBe("indeterminado");
    });
});
