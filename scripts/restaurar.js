// Restaura un volcado y comprueba que lo restaurado sirve (T4-05).
//
//   pnpm db:restaurar backups/stockly-20260811-163245.dump
//   pnpm db:restaurar <archivo> --a Stockly_ensayo
//   pnpm db:restaurar <archivo> --a Stockly --forzar
//
// **Por defecto no toca la base de la aplicación.** Sin `--a`, restaura en
// `<base>_restauracion`, que crea y sobrescribe; apuntar a la base que usa la aplicación
// exige `--forzar`, escrito a mano. La razón es que el ensayo de restauración hay que
// hacerlo a menudo —una copia que no se ha restaurado nunca no es una copia, es un
// archivo— y el comando del ensayo no puede ser el mismo que el del desastre.

const fs = require("node:fs");
const path = require("node:path");
const {
    conexion,
    herramientas,
    ejecutar,
    capturar,
    versionDelServidor,
    versionDelVolcado,
    evaluarCompatibilidad,
} = require("./postgres");

const TABLAS = ["products", "stock_movements", "sale_orders", "purchase_orders", "price_history", "users", "audit_logs"];

function argumentos() {
    const args = process.argv.slice(2);
    const archivo = args.find((a) => !a.startsWith("--"));
    const indice = args.indexOf("--a");

    return {
        archivo,
        destino: indice >= 0 ? args[indice + 1] : null,
        forzar: args.includes("--forzar"),
    };
}

function main() {
    const { archivo, destino, forzar } = argumentos();

    if (!archivo) {
        console.log("Uso: pnpm db:restaurar <archivo.dump> [--a <base>] [--forzar]");
        process.exitCode = 1;
        return;
    }

    if (!fs.existsSync(archivo)) {
        console.log(`✗ no existe ${archivo}`);
        process.exitCode = 1;
        return;
    }

    const { base, host, puerto, entorno } = conexion();
    const bin = herramientas(entorno);
    const objetivo = destino ?? `${base}_restauracion`;

    if (objetivo === base && !forzar) {
        console.log(
            `✗ ${objetivo} es la base que usa la aplicación. Restaurar encima la destruye.\n` +
                `  Para un ensayo, no pases --a: se restaura en ${base}_restauracion.\n` +
                `  Si de verdad es una recuperación, repite con --forzar.`,
        );
        process.exitCode = 1;
        return;
    }

    /*
     * T4-13 — la versión, comprobada **antes** de destruir nada.
     *
     * `pg_restore` solo va hacia adelante: un volcado de 17 en un servidor 16 falla, y lo
     * hacía a mitad de la restauración, con la base de destino ya borrada y recreada, y con
     * un error que habla de sintaxis y no de versiones. El día que se ejecuta esto de verdad
     * es el peor para averiguarlo.
     *
     * Esta comprobación va **encima del `dropdb`** a propósito: si sale mal, lo que había
     * sigue estando. Y avisa en vez de fallar cuando no puede saberlo —un volcado sin la
     * línea de cabecera, o un servidor que no responde a la consulta—, por lo mismo que la
     * auditoría de dependencias: una puerta que se cierra sin motivo se acaba esquivando.
     */
    const compatibilidad = evaluarCompatibilidad(
        versionDelVolcado(bin, archivo, entorno),
        versionDelServidor(bin, entorno),
    );

    if (compatibilidad.estado === "fallo") {
        console.log(
            `✗ el volcado viene de PostgreSQL ${compatibilidad.delVolcado} y este servidor es ${compatibilidad.delServidor}.\n` +
                `  pg_restore no va hacia atrás: la restauración fallaría a medias, con la base de\n` +
                `  destino ya borrada. No se ha tocado nada.\n\n` +
                `  Restaura en un servidor ${compatibilidad.delVolcado} o superior. La pila del compose levanta la\n` +
                `  versión que fija docker-compose.yml (ver docs/operaciones.md).`,
        );
        process.exitCode = 1;
        return;
    }

    if (compatibilidad.estado === "indeterminado") {
        console.log(`  aviso: no se ha podido comparar la versión del volcado con la del servidor (${compatibilidad.motivo}).`);
    }

    console.log(`Restaurando ${path.basename(archivo)} en ${objetivo} (${host}:${puerto}) …`);

    // `dropdb --force` cierra las conexiones abiertas. Sin eso, basta un Prisma Studio
    // olvidado —o el propio servidor de desarrollo— para que el borrado se quede
    // esperando y la restauración parezca colgada.
    capturar(bin, "dropdb", ["--if-exists", "--force", objetivo], entorno);

    if (ejecutar(bin, "createdb", [objetivo], entorno) !== 0) {
        console.log("✗ no se pudo crear la base de destino");
        process.exitCode = 1;
        return;
    }

    const inicio = Date.now();

    // `--exit-on-error` porque pg_restore, por defecto, **sigue tras un error y termina
    // con código 0**: una restauración a medias se anuncia como buena. `-j 4` reconstruye
    // los índices en paralelo, que es donde se va el tiempo en una base grande.
    const codigo = ejecutar(
        bin,
        "pg_restore",
        ["-d", objetivo, "--no-owner", "--no-privileges", "--exit-on-error", "-j", "4", archivo],
        entorno,
    );

    if (codigo !== 0) {
        console.log("✗ pg_restore falló: la base de destino queda incompleta y no debe usarse.");
        process.exitCode = 1;
        return;
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    // Que pg_restore devuelva 0 dice que el archivo se aplicó, no que lo restaurado tenga
    // sentido. Lo que se cuenta aquí es lo que se compara con el origen.
    const consulta = TABLAS.map((t) => `select '${t}' as tabla, count(*) from "${t}"`).join(" union all ");
    const filas = capturar(bin, "psql", ["-d", objetivo, "-XAtc", `${consulta} order by 1`], entorno);
    const migraciones = capturar(bin, "psql", ["-d", objetivo, "-XAtc", "select count(*) from _prisma_migrations where finished_at is not null"], entorno);

    console.log(`✓ restaurada en ${segundos} s\n`);
    console.log(filas.stdout.trim().split("\n").map((l) => `  ${l.replace("|", ": ")}`).join("\n"));
    console.log(`  migraciones aplicadas: ${migraciones.stdout.trim()}`);
    console.log(
        `\n  Falta la comprobación que ninguna consulta hace: que el esquema restaurado le sirva a la aplicación.\n` +
            `  DATABASE_URL="…/${objetivo}" pnpm exec prisma migrate status  → «Database schema is up to date!»`,
    );
}

main();
