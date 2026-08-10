import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * T3-03 — los doce módulos exportan igual.
 *
 * La ficha decía que solo `products` divergía. **Eran cinco**: `audit-logs`, `products`,
 * `purchase-orders`, `reports` y `sale-orders` exportaban funciones sueltas, frente a
 * siete que ya exportaban un objeto. Los doce servicios, en cambio, ya eran objeto — así
 * que la convención existía y lo que fallaba era el lado del controlador.
 *
 * Esto no es cosmética con un test detrás. Con dos estilos conviviendo, cada archivo de
 * rutas importaba distinto —trece nombres sueltos en `product.routes.ts`— y renombrar un
 * manejador obligaba a tocar la lista de importación entera. Con el objeto, el archivo de
 * rutas nombra el módulo una vez.
 *
 * El test recorre el directorio en vez de llevar una lista: un módulo nuevo entra solo, y
 * si nace con el estilo viejo se entera aquí y no en la revisión.
 */

const MODULOS = path.join(process.cwd(), "src", "modules");

/** `export const algoController = {` / `export const algoService = {` */
const EXPORTA_OBJETO = (sufijo: string) => new RegExp(`^export const \\w+${sufijo} = \\{`, "m");
const EXPORTA_FUNCION_SUELTA = /^export (async )?function \w+\(/m;

function archivosPorSufijo(sufijo: string): Array<{ modulo: string; ruta: string }> {
    const encontrados: Array<{ modulo: string; ruta: string }> = [];

    for (const modulo of readdirSync(MODULOS)) {
        const dir = path.join(MODULOS, modulo);
        for (const archivo of readdirSync(dir)) {
            if (archivo.endsWith(`.${sufijo}.ts`)) {
                encontrados.push({ modulo, ruta: path.join(dir, archivo) });
            }
        }
    }

    return encontrados;
}

describe("Convención de exportación de los módulos (T3-03)", () => {
    it("hay doce módulos, y ese número es el que se está comprobando", () => {
        // Si aparece un módulo nuevo, este número cambia y obliga a mirar los otros dos
        // tests en vez de asumir que siguen cubriendo todo.
        expect(readdirSync(MODULOS)).toHaveLength(12);
    });

    it.each(["controller", "service"])("todos los %s exportan un objeto con nombre", (sufijo) => {
        const sufijoCapitalizado = sufijo === "controller" ? "Controller" : "Service";
        const infracciones = archivosPorSufijo(sufijo)
            .filter(({ ruta }) => !EXPORTA_OBJETO(sufijoCapitalizado).test(readFileSync(ruta, "utf8")))
            .map(({ modulo }) => modulo);

        expect(infracciones).toEqual([]);
    });

    it.each(["controller", "service"])("ningún %s deja funciones sueltas exportadas", (sufijo) => {
        // El objeto por sí solo no basta: se puede tener las dos cosas a la vez, que es
        // exactamente el estado intermedio en el que se queda un refactor a medias.
        const infracciones = archivosPorSufijo(sufijo)
            .filter(({ ruta }) => EXPORTA_FUNCION_SUELTA.test(readFileSync(ruta, "utf8")))
            .map(({ modulo }) => modulo);

        expect(infracciones).toEqual([]);
    });
});
