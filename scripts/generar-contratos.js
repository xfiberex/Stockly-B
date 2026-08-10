/**
 * T4-01 — Copia el contrato de la API al repositorio del frontend.
 *
 *     pnpm contratos:generar
 *
 * `src/contratos/api.ts` es la fuente de verdad; `Stockly-F` recibe una copia literal,
 * versionada allí, y compila contra ella.
 *
 * ## Por qué copiar en vez de compartir un paquete
 *
 * Stockly son **dos repositorios git independientes** con la carpeta que los contiene sin
 * versionar, así que un workspace de pnpm no puede abarcarlos: quien clone uno solo se
 * quedaría sin la mitad. Las alternativas se descartaron por su coste real en este
 * proyecto, no por gusto:
 *
 * - **Registro de paquetes:** sin CI, cada cambio de contrato serían cuatro pasos a mano
 *   (subir versión, publicar, actualizar los dos repos) y el build de Docker necesitaría
 *   un token en la imagen.
 * - **Submódulo git:** un tercer repositorio y ceremonia de `--recursive` en cada clon,
 *   en dos máquinas, con el riesgo clásico de commitear un puntero viejo.
 *
 * Copiar no tiene ninguna de esas contrapartidas y conserva lo que importa: **un solo
 * sitio donde se edita**. Que la copia no se quede atrás lo vigilan dos tests, uno en cada
 * repositorio (`contratos.test.ts` aquí, `frescura.test.ts` allí), así que un olvido pone
 * `pnpm verify` en rojo en vez de pasar desapercibido.
 *
 * La copia se escribe con finales de línea LF y sin tocar nada más: el archivo de destino
 * es byte a byte la cabecera de abajo seguida del original.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ORIGEN = path.join(__dirname, "..", "src", "contratos", "api.ts");
const DESTINO = path.join(__dirname, "..", "..", "Stockly-F", "src", "shared", "contratos", "api.generated.ts");

/** Normaliza a LF para que el hash no dependa de cómo tenga configurado git cada máquina. */
function normalizar(texto) {
    return texto.replace(/\r\n/g, "\n");
}

function huella(fuente) {
    return crypto.createHash("sha256").update(normalizar(fuente), "utf8").digest("hex").slice(0, 16);
}

/**
 * El contenido exacto que debe tener el archivo generado. Lo comparten el generador y los
 * dos tests de frescura: si se calculara en cada sitio por su cuenta, un cambio en la
 * cabecera daría falsos positivos.
 */
function contenidoGenerado(fuente) {
    const normalizada = normalizar(fuente);

    return (
        [
            "// ╔══════════════════════════════════════════════════════════════════════════╗",
            "// ║  ARCHIVO GENERADO — NO EDITAR A MANO                                     ║",
            "// ╚══════════════════════════════════════════════════════════════════════════╝",
            "//",
            "// Copia literal de `Stockly-B/src/contratos/api.ts`, que es la fuente de verdad.",
            "// Para cambiarlo: edítalo allí y ejecuta `pnpm contratos:generar` en el backend.",
            "//",
            "// Editar este archivo directamente no sirve de nada: `frescura.test.ts` compara",
            "// su contenido con el del backend y falla, y la próxima generación lo pisa.",
            "//",
            `// huella: ${huella(fuente)}`,
            "",
            "",
        ].join("\n") + normalizada
    );
}

module.exports = { contenidoGenerado, huella, normalizar, generar, ORIGEN, DESTINO };

/**
 * Todo el trabajo va dentro de una función y no suelto bajo `if (require.main === module)`.
 *
 * No es estilo: con los `return` en el nivel superior, este archivo **deja de parsearse**
 * cuando jest lo instrumenta para cobertura. Node envuelve cada módulo CommonJS en una
 * función, así que ahí un `return` de primer nivel es legal; babel lo lee como módulo ES,
 * donde no lo es, y falla con «'return' outside of function». El síntoma es de los que
 * despistan: `pnpm test` en verde y `pnpm test:coverage` en rojo, señalando el `require`
 * del test en vez del archivo requerido.
 */
function generar() {
    if (!fs.existsSync(ORIGEN)) {
        console.error(`No existe la fuente del contrato: ${ORIGEN}`);
        process.exitCode = 1;
        return;
    }

    const carpeta = path.dirname(DESTINO);
    if (!fs.existsSync(carpeta)) {
        // Si falta el repositorio hermano entero, crear la carpeta no arregla nada y
        // esconde el problema: mejor decir qué falta.
        const repo = path.join(__dirname, "..", "..", "Stockly-F");
        if (!fs.existsSync(repo)) {
            console.error(
                `No encuentro «Stockly-F» en ${repo}.\n` +
                    "Los dos repositorios se clonan uno al lado del otro; sin el hermano no hay dónde generar.",
            );
            process.exitCode = 1;
            return;
        }
        fs.mkdirSync(carpeta, { recursive: true });
    }

    const fuente = fs.readFileSync(ORIGEN, "utf8");
    const nuevo = contenidoGenerado(fuente);
    const anterior = fs.existsSync(DESTINO) ? normalizar(fs.readFileSync(DESTINO, "utf8")) : null;

    if (anterior === nuevo) {
        console.log(`El contrato ya estaba al día (huella ${huella(fuente)}).`);
        return;
    }

    fs.writeFileSync(DESTINO, nuevo, "utf8");
    console.log(
        `${anterior === null ? "Creado" : "Actualizado"}: ${path.relative(path.join(__dirname, "..", ".."), DESTINO)}\n` +
            `huella ${huella(fuente)} · ${nuevo.split("\n").length} líneas\n` +
            "Recuerda commitear el cambio en los DOS repositorios.",
    );
}

if (require.main === module) generar();
