// Análisis de composición: vulnerabilidades y licencias de las dependencias de producción.
//
// Es el paso de `pnpm verify` que cubre la zona que la auditoría del 2026-08-04 dejó sin
// mirar (T4-07). Son dos comprobaciones con naturalezas distintas, y por eso el guion no
// las trata igual:
//
//   1. **Vulnerabilidades** (`pnpm audit`). Necesita red: consulta la base de avisos. Si no
//      hay red no se puede saber, y «no se puede saber» no es lo mismo que «hay un
//      problema»: avisa y deja pasar. Este proyecto no tiene CI (decisión del 2026-08-06),
//      así que `verify` se ejecuta en portátiles y en trenes; una puerta que se pone roja
//      sin conexión se acabaría saltando con `--no-verify`, que es peor que no tenerla.
//      Para el momento en que sí importa —antes de publicar— está `--estricto`, que
//      convierte «no pude auditar» en fallo.
//   2. **Licencias**. Se resuelven del lockfile y del almacén, sin red. Esa sí es una
//      puerta dura y sin excusa: una dependencia nueva con una licencia que no está en la
//      lista para el gate hasta que alguien la mire.
//
// **La trampa que costó descubrir esto:** `pnpm audit --json` con el registro caído sigue
// imprimiendo un informe con las cinco severidades a cero. Leer `metadata` sin más da un
// verde falso — la auditoría que nunca se hizo se lee igual que la que salió limpia. Lo
// que distingue los dos casos es la clave `error` del JSON, no el código de salida.

const { spawnSync } = require("node:child_process");

// Alta o crítica rompe la compilación; moderada y baja se informan y no bloquean. El corte
// lo fija el criterio de aceptación de T4-07.
const SEVERIDADES_QUE_BLOQUEAN = ["high", "critical"];

// Licencias admitidas en el árbol de producción, tal y como las declara cada paquete.
// Comparadas sin distinguir mayúsculas, porque la cadena no está normalizada: conviven
// «MIT and ISC» y «MIT AND ISC» en los dos repositorios.
//
// Lo que **no** está aquí es tan importante como lo que sí: sin GPL, LGPL, AGPL ni SSPL.
// Cualquiera de ellas en una dependencia de producción es una decisión de licenciamiento
// del producto entero, no un detalle de instalación, y tiene que pararse a mirar.
const LICENCIAS_PERMITIDAS = [
    "MIT",
    "MIT-0",
    "ISC",
    "MIT and ISC",
    "MIT AND ISC",
    "(MIT AND Zlib)",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "Unlicense",
    // Copyleft **por archivo**, no por obra derivada: la obligación se dispara al modificar
    // los archivos de la propia biblioteca, no al depender de ella. Aquí llega por
    // `prisma` → `@prisma/studio-core` → `elkjs`, y no se toca su código.
    "EPL-2.0",
];

/**
 * Decide si el recuento de vulnerabilidades debe romper la compilación.
 *
 * Separada del resto para poder probarla: sin una vulnerabilidad real en el árbol no hay
 * forma de ver la puerta en rojo, y una puerta que nunca se ha visto fallar no está
 * demostrada.
 */
function evaluarVulnerabilidades(informe) {
    if (!informe || informe.error) {
        return { estado: "indeterminado", motivo: informe?.error?.message ?? "sin informe" };
    }

    const recuento = informe.metadata?.vulnerabilities;
    if (!recuento) return { estado: "indeterminado", motivo: "el informe no trae recuento" };

    const bloqueantes = SEVERIDADES_QUE_BLOQUEAN.reduce((total, s) => total + (recuento[s] ?? 0), 0);

    return {
        estado: bloqueantes > 0 ? "fallo" : "correcto",
        bloqueantes,
        recuento,
    };
}

/**
 * Devuelve las licencias del árbol que no están en la lista, con los paquetes que las traen.
 */
function evaluarLicencias(listado, permitidas = LICENCIAS_PERMITIDAS) {
    const admitidas = new Set(permitidas.map((l) => l.toUpperCase()));

    const desconocidas = Object.entries(listado ?? {})
        .filter(([licencia]) => !admitidas.has(licencia.toUpperCase()))
        .map(([licencia, paquetes]) => ({
            licencia,
            paquetes: (paquetes ?? []).map((p) => p.name),
        }));

    return { estado: desconocidas.length > 0 ? "fallo" : "correcto", desconocidas };
}

function ejecutarPnpm(argumentos) {
    // Comando entero en una cadena y `shell: true`. Hace falta shell —en Windows `pnpm` es
    // un `.cmd`, y Node se niega a lanzarlo directamente desde que se cerró CVE-2024-27980—
    // y **la cadena única evita el aviso DEP0190**, que salta al mezclar shell con un array
    // de argumentos porque se concatenan sin escapar. Aquí no hay entrada de nadie: los
    // argumentos son literales de este archivo.
    const resultado = spawnSync(`pnpm ${argumentos.join(" ")}`, { shell: true, encoding: "utf8" });

    try {
        return JSON.parse(resultado.stdout);
    } catch {
        // Ni siquiera hubo JSON: pnpm no está, o reventó antes de escribir nada.
        return { error: { message: (resultado.stderr || "").trim() || "pnpm no devolvió JSON" } };
    }
}

function main() {
    const estricto = process.argv.includes("--estricto");
    let codigo = 0;

    // ── Vulnerabilidades ──────────────────────────────────────────────────────
    const vulnerabilidades = evaluarVulnerabilidades(ejecutarPnpm(["audit", "--prod", "--json"]));

    if (vulnerabilidades.estado === "indeterminado") {
        console.log(`⚠ no se pudo auditar (${vulnerabilidades.motivo})`);
        if (estricto) {
            console.log("  --estricto: se trata como fallo");
            codigo = 1;
        }
    } else {
        const { info, low, moderate, high, critical } = vulnerabilidades.recuento;
        const resumen = `crítica ${critical}, alta ${high}, moderada ${moderate}, baja ${low}, info ${info}`;

        if (vulnerabilidades.estado === "fallo") {
            console.log(`✗ ${vulnerabilidades.bloqueantes} vulnerabilidad(es) alta o superior — ${resumen}`);
            console.log("  detalle: pnpm audit --prod");
            codigo = 1;
        } else {
            console.log(`✓ sin vulnerabilidades altas ni críticas — ${resumen}`);
        }
    }

    // ── Licencias ─────────────────────────────────────────────────────────────
    const listado = ejecutarPnpm(["licenses", "list", "--prod", "--json"]);

    if (listado.error) {
        console.log(`✗ no se pudo listar licencias (${listado.error.message})`);
        codigo = 1;
    } else {
        const licencias = evaluarLicencias(listado);

        if (licencias.estado === "fallo") {
            console.log("✗ licencias fuera de la lista permitida:");
            for (const { licencia, paquetes } of licencias.desconocidas) {
                console.log(`    ${licencia} → ${paquetes.join(", ")}`);
            }
            console.log("  si es aceptable, añádela a LICENCIAS_PERMITIDAS en scripts/auditoria.js");
            codigo = 1;
        } else {
            const total = Object.values(listado).reduce((n, p) => n + p.length, 0);
            console.log(`✓ ${total} paquetes de producción, ${Object.keys(listado).length} licencias, todas permitidas`);
        }
    }

    process.exitCode = codigo;
}

if (require.main === module) main();

module.exports = { evaluarVulnerabilidades, evaluarLicencias, LICENCIAS_PERMITIDAS, SEVERIDADES_QUE_BLOQUEAN };
