// @ts-expect-error — `scripts/` es utillaje en JS plano, sin tipos y fuera de `src`.
import { evaluarVulnerabilidades, evaluarLicencias, LICENCIAS_PERMITIDAS } from "../../scripts/auditoria.js";

/**
 * El criterio de aceptación de T4-07 dice que la verificación local **falla** ante una
 * vulnerabilidad alta o superior en dependencias de producción. Hoy el árbol está limpio,
 * así que ejecutar el guion no demuestra nada: sale verde tanto si la puerta funciona como
 * si no comprueba nada. Estos tests son la demostración, con informes fabricados.
 */
describe("auditoría de dependencias (T4-07)", () => {
    const recuento = (parcial: Record<string, number>) => ({
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...parcial } },
    });

    describe("vulnerabilidades", () => {
        it("una alta rompe la compilación", () => {
            expect(evaluarVulnerabilidades(recuento({ high: 1 })).estado).toBe("fallo");
        });

        it("una crítica rompe la compilación", () => {
            expect(evaluarVulnerabilidades(recuento({ critical: 1 })).estado).toBe("fallo");
        });

        it("moderadas y bajas se informan pero no bloquean", () => {
            // El corte está en «alta» a propósito: una puerta que salta con cualquier aviso
            // de severidad baja se acaba desactivando, y entonces no protege de nada.
            const resultado = evaluarVulnerabilidades(recuento({ moderate: 4, low: 9, info: 2 }));

            expect(resultado.estado).toBe("correcto");
            expect(resultado.bloqueantes).toBe(0);
        });

        it("un árbol limpio pasa", () => {
            expect(evaluarVulnerabilidades(recuento({})).estado).toBe("correcto");
        });

        // **El fallo que este guion existe para no cometer.** `pnpm audit --json` sin acceso
        // al registro puede devolver un informe con las cinco severidades a cero: la
        // auditoría que no se hizo se lee igual que la que salió limpia. Distinguirlas es lo
        // que impide un verde falso.
        it("no confunde «no se pudo auditar» con «no hay vulnerabilidades»", () => {
            expect(evaluarVulnerabilidades({ error: { message: "fetch failed" } }).estado)
                .toBe("indeterminado");
            expect(evaluarVulnerabilidades({}).estado).toBe("indeterminado");
            expect(evaluarVulnerabilidades(null).estado).toBe("indeterminado");
        });
    });

    describe("licencias", () => {
        it("una GPL en producción para el gate", () => {
            const resultado = evaluarLicencias({ "GPL-3.0": [{ name: "biblioteca-viral" }] });

            expect(resultado.estado).toBe("fallo");
            expect(resultado.desconocidas[0].paquetes).toContain("biblioteca-viral");
        });

        it("también AGPL y SSPL, que son las que más caro salen", () => {
            for (const licencia of ["AGPL-3.0", "SSPL-1.0", "LGPL-2.1"]) {
                expect(evaluarLicencias({ [licencia]: [{ name: "x" }] }).estado).toBe("fallo");
            }
        });

        it("el árbol permitido pasa entero", () => {
            const listado = Object.fromEntries(LICENCIAS_PERMITIDAS.map((l: string) => [l, [{ name: "x" }]]));

            expect(evaluarLicencias(listado).estado).toBe("correcto");
        });

        it("no distingue mayúsculas: conviven «MIT and ISC» y «MIT AND ISC»", () => {
            // La cadena sale tal cual del `package.json` de cada paquete y no está
            // normalizada; comparar literalmente dejaría fuera al mismo par por la conjunción.
            expect(evaluarLicencias({ "mit AND isc": [{ name: "x" }] }).estado).toBe("correcto");
        });

        it("una licencia sin declarar no se cuela", () => {
            expect(evaluarLicencias({ Unknown: [{ name: "sin-licencia" }] }).estado).toBe("fallo");
        });
    });
});
