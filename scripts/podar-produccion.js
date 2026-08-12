// Poda del árbol de producción de la imagen (T4-14).
//
//   node scripts/podar-produccion.js            # dentro de la etapa `deps` del Dockerfile
//   node scripts/podar-produccion.js --simular  # dice qué borraría, sin borrar
//
// **El problema.** `@prisma/client` declara `prisma` y `typescript` como *peers opcionales*,
// y pnpm los instala solos. Con `prisma` llega su árbol entero: `@prisma/studio-core` —una
// interfaz gráfica, con React y sus diagramas—, `@prisma/dev`, `@electric-sql/pglite` (un
// PostgreSQL para el navegador) y `effect`. Nada de eso lo importa un servidor, y `prisma`
// ni siquiera está enlazado en la raíz desde que vive en `devDependencies`.
//
// **Por qué una regla y no una lista.** La primera versión de esta poda enumeraba paquetes a
// mano: recortaba el tamaño pero dejaba 292 entradas de 313, porque las dependencias
// transitivas del CLI no estaban en la lista y no hay forma de acertar con todas. Y una lista
// escrita a mano envejece con cada versión de Prisma sin que nadie se entere.
//
// Aquí se hace al revés: se **cortan los dos peers** —que es la decisión, y cabe en una
// línea— y luego se borra todo lo que deje de ser alcanzable desde los enlaces de la raíz.
// Un paquete nuevo en el árbol del CLI se va solo, sin tocar este archivo.

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = process.env.PODA_RAIZ ?? "node_modules";
const ALMACEN = path.join(RAIZ, ".pnpm");
const SIMULAR = process.argv.includes("--simular");

/** Los peers opcionales que el servidor no usa. Cortarlos es toda la decisión. */
const PEERS_QUE_SOBRAN = [/^prisma@/, /^typescript@/];

/**
 * Los directorios de `node_modules/` de una entrada del almacén.
 *
 * pnpm coloca cada paquete en `.pnpm/<nombre>@<version>_<huella>/node_modules/`, y **junto a
 * él, en esa misma carpeta, enlaces a sus dependencias**. Recorrer esos enlaces es recorrer
 * el grafo real de lo que se puede importar.
 */
function dependenciasDe(entrada) {
    const base = path.join(ALMACEN, entrada, "node_modules");
    if (!fs.existsSync(base)) return [];

    const salida = [];

    for (const nombre of fs.readdirSync(base)) {
        // Los paquetes con ámbito son un nivel más: `@prisma/client` es `@prisma/` + `client`.
        const hijos = nombre.startsWith("@")
            ? fs.readdirSync(path.join(base, nombre)).map((n) => path.join(nombre, n))
            : [nombre];

        for (const hijo of hijos) {
            const destino = resolverEnlace(path.join(base, hijo));
            if (destino) salida.push(destino);
        }
    }

    return salida;
}

/** De un enlace de `node_modules` a la entrada del almacén a la que apunta, si es que apunta. */
function resolverEnlace(ruta) {
    let real;
    try {
        // `realpathSync` sigue la cadena entera; un enlace roto —el peer que acabamos de
        // borrar— lanza, y eso es justo lo que queremos: ahí se corta el recorrido.
        real = fs.realpathSync(ruta);
    } catch {
        return null;
    }

    const absoluto = path.resolve(ALMACEN);
    if (!real.startsWith(absoluto + path.sep)) return null;

    // `<almacén>/<entrada>/node_modules/<paquete>` → `<entrada>`
    return real.slice(absoluto.length + 1).split(path.sep)[0];
}

function main() {
    if (!fs.existsSync(ALMACEN)) {
        console.error(`✗ no existe ${ALMACEN}. Este guion corre sobre una instalación de pnpm.`);
        process.exitCode = 1;
        return;
    }

    const todas = fs.readdirSync(ALMACEN).filter((e) => e !== "node_modules" && e !== "lock.yaml");

    // ── 1. Cortar los peers ───────────────────────────────────────────────────
    const cortadas = todas.filter((e) => PEERS_QUE_SOBRAN.some((r) => r.test(e)));

    for (const entrada of cortadas) {
        if (!SIMULAR) fs.rmSync(path.join(ALMACEN, entrada), { recursive: true, force: true });
    }
    for (const nombre of ["prisma", "typescript"]) {
        const enlace = path.join(RAIZ, nombre);
        if (fs.existsSync(enlace) && !SIMULAR) fs.rmSync(enlace, { recursive: true, force: true });
    }

    // ── 2. Marcar lo alcanzable desde la raíz ─────────────────────────────────
    // El punto de partida son los enlaces de `node_modules/`, que es exactamente lo que el
    // servidor puede escribir en un `require`. Todo lo demás está solo porque acompañaba.
    const vivas = new Set();
    const cola = [];

    for (const nombre of fs.readdirSync(RAIZ)) {
        if (nombre === ".pnpm" || nombre === ".bin") continue;
        const rutas = nombre.startsWith("@")
            ? fs.readdirSync(path.join(RAIZ, nombre)).map((n) => path.join(nombre, n))
            : [nombre];

        for (const ruta of rutas) {
            const entrada = resolverEnlace(path.join(RAIZ, ruta));
            if (entrada && !vivas.has(entrada)) {
                vivas.add(entrada);
                cola.push(entrada);
            }
        }
    }

    while (cola.length > 0) {
        for (const dependencia of dependenciasDe(cola.pop())) {
            if (!vivas.has(dependencia)) {
                vivas.add(dependencia);
                cola.push(dependencia);
            }
        }
    }

    // ── 3. Barrer el resto ────────────────────────────────────────────────────
    const restantes = SIMULAR ? todas.filter((e) => !cortadas.includes(e)) : fs.readdirSync(ALMACEN).filter((e) => e !== "node_modules" && e !== "lock.yaml");
    const muertas = restantes.filter((e) => !vivas.has(e));

    for (const entrada of muertas) {
        if (!SIMULAR) fs.rmSync(path.join(ALMACEN, entrada), { recursive: true, force: true });
    }

    const verbo = SIMULAR ? "se borrarían" : "borradas";
    console.log(
        `${SIMULAR ? "○" : "✓"} poda: ${todas.length} entradas → ${vivas.size} ` +
            `(${verbo} ${cortadas.length} de peers y ${muertas.length} inalcanzables)`,
    );
}

if (require.main === module) main();

module.exports = { PEERS_QUE_SOBRAN };
