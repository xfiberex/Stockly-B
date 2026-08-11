// Lo que `backup.js` y `restaurar.js` necesitan de PostgreSQL: de dónde salen las
// credenciales y dónde están las herramientas. Está aquí y no duplicado en los dos
// porque las dos trampas que resuelve —la contraseña y la versión del cliente— se
// pagan igual al volcar que al restaurar.
//
// **Se escriben en Node y no en `.sh` a propósito.** El proyecto se trabaja desde
// Windows y la copia de seguridad tiene que poder lanzarse desde el Programador de
// tareas igual que desde `cron`; un guion de shell obligaría a mantener dos.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config();

/**
 * Los datos de conexión, listos para las herramientas de PostgreSQL.
 *
 * **No se pasa `DATABASE_URL` a `pg_dump -d` tal cual, aunque acepte una URI.** La del
 * `.env` de este proyecto lleva una `@` sin codificar dentro de la contraseña: Prisma
 * la admite —tiene su propio analizador— y libpq no, que parte por la **primera** `@` y
 * acaba buscando un socket llamado `@localhost`. El error que da no menciona la
 * contraseña por ningún lado, así que se diagnostica mal:
 *
 *     pg_dump: error: falló la conexión al servidor en el socket «@localhost/…»
 *
 * `new URL()` parte por la **última**, que es lo correcto, y devuelve la contraseña ya
 * codificada. De ahí se sacan las variables `PG*`, que además mantienen la contraseña
 * **fuera de la línea de comandos** —`argv` lo ve cualquiera con acceso a la lista de
 * procesos—.
 */
function conexion(url = process.env.DATABASE_URL) {
    if (!url) throw new Error("Falta DATABASE_URL: no hay base que copiar. Revisa el .env.");

    const u = new URL(url);

    return {
        base: decodeURIComponent(u.pathname.replace(/^\//, "")),
        host: u.hostname,
        puerto: u.port || "5432",
        entorno: {
            PGHOST: u.hostname,
            PGPORT: u.port || "5432",
            PGUSER: decodeURIComponent(u.username),
            PGPASSWORD: decodeURIComponent(u.password),
            // Sin esto, en una consola de Windows con página de códigos 850 el cliente
            // negocia latin1 y cualquier acento del catálogo viaja roto.
            PGCLIENTENCODING: "UTF8",
        },
    };
}

/** Devuelve `major` del servidor, o `null` si no se puede preguntar todavía. */
function versionDelServidor(bin, entorno) {
    const r = spawnSync(path.join(bin, "psql"), ["-d", "postgres", "-XAtc", "show server_version_num"], {
        env: { ...process.env, ...entorno },
        encoding: "utf8",
    });

    if (r.status !== 0) return null;
    return Math.floor(Number(r.stdout.trim()) / 10000);
}

/**
 * El directorio de las herramientas de PostgreSQL.
 *
 * **La versión del cliente no da igual, y es el fallo silencioso de esta tarea.** Un
 * `pg_dump` más antiguo que el servidor se niega en seco —eso se ve—, pero uno más
 * **nuevo** vuelca sin protestar y mete sintaxis que el servidor de destino puede no
 * entender al restaurar; el problema aparece en la restauración, que es justo el día en
 * que no se quiere depurar nada. Por eso se elige el cliente cuya versión mayor coincide
 * con la del servidor, y solo si no hay ninguno se cae al más nuevo instalado, avisando.
 *
 * En esta máquina hay dos instalaciones (17 y 18) y **ninguna en el PATH**, que es el
 * caso normal en Windows: el instalador no lo toca. `PG_BIN` corta por lo sano.
 */
function herramientas(entorno) {
    if (process.env.PG_BIN) return process.env.PG_BIN;

    const candidatos = [];

    // El PATH primero: en Linux y en macOS es lo único que hay.
    if (spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0) candidatos.push({ bin: "", major: null });

    const raiz = "C:\\Program Files\\PostgreSQL";
    if (fs.existsSync(raiz)) {
        for (const version of fs.readdirSync(raiz)) {
            const bin = path.join(raiz, version, "bin");
            if (fs.existsSync(path.join(bin, "pg_dump.exe"))) candidatos.push({ bin, major: Number(version) });
        }
    }

    if (candidatos.length === 0) {
        throw new Error(
            "No se encuentra pg_dump. Instala las herramientas de cliente de PostgreSQL " +
                "o apunta PG_BIN a su directorio bin.",
        );
    }

    candidatos.sort((a, b) => (b.major ?? 0) - (a.major ?? 0));

    const servidor = versionDelServidor(candidatos[0].bin, entorno);
    const exacto = candidatos.find((c) => c.major === servidor);

    if (exacto) return exacto.bin;

    if (servidor !== null) {
        console.log(
            `  aviso: el servidor es PostgreSQL ${servidor} y el cliente más cercano es ` +
                `${candidatos[0].major ?? "el del PATH"}. Restaurar este volcado en un servidor ${servidor} puede fallar.`,
        );
    }

    return candidatos[0].bin;
}

/** Ejecuta una herramienta de PostgreSQL heredando la salida. Devuelve el código. */
function ejecutar(bin, herramienta, argumentos, entorno) {
    const r = spawnSync(path.join(bin, herramienta), argumentos, {
        env: { ...process.env, ...entorno },
        stdio: "inherit",
    });

    if (r.error) throw r.error;
    return r.status;
}

/** Como `ejecutar`, pero captura la salida en vez de heredarla. */
function capturar(bin, herramienta, argumentos, entorno) {
    return spawnSync(path.join(bin, herramienta), argumentos, {
        env: { ...process.env, ...entorno },
        encoding: "utf8",
    });
}

module.exports = { conexion, herramientas, ejecutar, capturar };
