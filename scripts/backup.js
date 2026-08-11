// Copia de seguridad de la base, con retención (T4-05).
//
//   pnpm db:backup
//
// Escribe `backups/stockly-<fecha>-<hora>.dump` en formato **custom** (`-Fc`), que es
// comprimido, restaurable en paralelo y admite restauración selectiva de una tabla; un
// `.sql` plano no hace ninguna de las tres.
//
// Variables (todas opcionales):
//   BACKUP_DIR             dónde escribir            (por defecto ./backups)
//   BACKUP_RETENTION_DAYS  antigüedad máxima         (por defecto 14)
//   BACKUP_RETENTION_MIN   copias que nunca se borran (por defecto 3)
//   PG_BIN                 directorio de pg_dump si no está en el PATH

const fs = require("node:fs");
const path = require("node:path");
const { conexion, herramientas, ejecutar, capturar } = require("./postgres");

const DIAS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const MINIMO = Number(process.env.BACKUP_RETENTION_MIN ?? 3);
const DIRECTORIO = path.resolve(process.env.BACKUP_DIR ?? path.join(__dirname, "..", "backups"));
const PATRON = /^stockly-\d{8}-\d{6}\.dump$/;

/** `20260811-163245`, en hora local: es la que usa quien busca «la copia de anoche». */
function marcaDeTiempo(fecha = new Date()) {
    const dosCifras = (n) => String(n).padStart(2, "0");
    return (
        `${fecha.getFullYear()}${dosCifras(fecha.getMonth() + 1)}${dosCifras(fecha.getDate())}` +
        `-${dosCifras(fecha.getHours())}${dosCifras(fecha.getMinutes())}${dosCifras(fecha.getSeconds())}`
    );
}

function tamaño(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Borra lo caducado. **Solo se llama si el volcado nuevo está verificado**, y aun así
 * respeta un mínimo de copias.
 *
 * Las dos guardias responden al mismo fallo, que es el que convierte una retención en
 * una pérdida de datos: si los volcados llevan un mes fallando y nadie mira el registro,
 * una poda por antigüedad a secas borra la última copia buena justo cuando es lo único
 * que queda. Con `BACKUP_RETENTION_MIN` el directorio nunca se vacía solo.
 */
function podar() {
    const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000;

    const copias = fs
        .readdirSync(DIRECTORIO)
        .filter((n) => PATRON.test(n))
        .map((n) => ({ nombre: n, mtime: fs.statSync(path.join(DIRECTORIO, n)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

    const caducadas = copias.slice(MINIMO).filter((c) => c.mtime < limite);

    for (const copia of caducadas) fs.unlinkSync(path.join(DIRECTORIO, copia.nombre));

    return { borradas: caducadas.length, quedan: copias.length - caducadas.length };
}

function main() {
    const { base, host, puerto, entorno } = conexion();
    const bin = herramientas(entorno);

    fs.mkdirSync(DIRECTORIO, { recursive: true });

    const destino = path.join(DIRECTORIO, `stockly-${marcaDeTiempo()}.dump`);
    const inicio = Date.now();

    console.log(`Copiando ${base} (${host}:${puerto}) …`);

    // `-Z 6` es el punto medio de zlib. Sobre estos datos el volcado baja de 31 MB de
    // base a 77 KB de archivo: casi todo el tamaño de la base son índices, que no se
    // vuelcan —se reconstruyen al restaurar—.
    const codigo = ejecutar(bin, "pg_dump", ["-d", base, "-Fc", "-Z", "6", "-f", destino], entorno);

    if (codigo !== 0) {
        // Un volcado a medias es peor que ninguno: parece una copia y no lo es.
        if (fs.existsSync(destino)) fs.unlinkSync(destino);
        console.log("✗ pg_dump falló. No se ha podado nada.");
        process.exitCode = 1;
        return;
    }

    // Verificar **antes** de podar. `pg_restore --list` lee el índice del archivo, así
    // que un volcado truncado o corrupto se cae aquí y no el día de la restauración.
    const listado = capturar(bin, "pg_restore", ["--list", destino], entorno);

    if (listado.status !== 0) {
        fs.unlinkSync(destino);
        console.log(`✗ el volcado no se puede leer, se descarta:\n${listado.stderr}`);
        process.exitCode = 1;
        return;
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    const objetos = listado.stdout.split("\n").filter((l) => l && !l.startsWith(";")).length;

    console.log(`✓ ${path.basename(destino)} — ${tamaño(fs.statSync(destino).size)}, ${objetos} objetos, ${segundos} s`);

    const { borradas, quedan } = podar();
    console.log(`  retención: ${DIAS} días, mínimo ${MINIMO} copias → ${borradas} borradas, ${quedan} en ${DIRECTORIO}`);
}

main();
