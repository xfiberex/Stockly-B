// Lanza la prueba de carga de k6 contra el backend apuntando a la base de carga (T4-08).
//
// Existe para que la prueba sea repetible sin acordarse de cuatro cosas, y **una de ellas
// invalida la medición en silencio**: el limitador de peticiones. Con los valores de fábrica
// —100 peticiones cada 15 minutos— una prueba de carga mide 429 en cuanto arranca, y los
// tiempos salen buenísimos porque rechazar es barato. La misma trampa que ya se pagó en el
// E2E (`docs/CONTEXTO.md §4`).
//
// Lo que hace, en orden:
//   1. arranca `dist/server.js` contra `Stockly_carga`, en un puerto propio y con el
//      limitador levantado;
//   2. espera a que `/health` responda;
//   3. ejecuta k6 **en Docker** —no está instalado en esta máquina— con la salida en JSON;
//   4. mata el servidor y resume.
//
// Uso:
//   pnpm build && node load/ejecutar.js
//   node load/ejecutar.js --base=Stockly_carga --puerto=3200

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { conexion } = require("../scripts/postgres");

const argumento = (nombre, pordefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split("=")[1] : pordefecto;
};

const BASE = argumento("base", "Stockly_carga");
const PUERTO = argumento("puerto", "3200");
const ESPERA_CIERRE_MS = 5000;

const { base: baseDeLaApp, entorno } = conexion();

if (BASE === baseDeLaApp) {
    console.error(`✗ «${BASE}» es la base de la aplicación. La prueba escribe movimientos.`);
    process.exit(1);
}

const compilado = path.join(__dirname, "..", "dist", "server.js");
if (!fs.existsSync(compilado)) {
    console.error("✗ No hay dist/server.js. Ejecuta `pnpm build` antes.");
    process.exit(1);
}

const url = `postgresql://${encodeURIComponent(entorno.PGUSER)}:${encodeURIComponent(entorno.PGPASSWORD)}@${entorno.PGHOST}:${entorno.PGPORT}/${BASE}`;

const servidor = spawn(process.execPath, [compilado], {
    env: {
        ...process.env,
        DATABASE_URL: url,
        PORT: PUERTO,
        NODE_ENV: "production",
        // Sin esto la prueba mide el limitador, no el inventario.
        RATE_LIMIT_MAX: "1000000",
        AUTH_RATE_LIMIT_MAX: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
});

let salida = "";
servidor.stdout.on("data", (t) => (salida += t));
servidor.stderr.on("data", (t) => (salida += t));

let haTerminado = false;
servidor.on("exit", () => (haTerminado = true));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Igual que en `scripts/smoke.js`: se espera al evento 'exit' y se usa `process.exitCode`.
// Llamar a `process.exit()` con el hijo aún cerrándose aborta libuv en Windows.
async function detener() {
    if (haTerminado) return;
    servidor.kill();

    const limite = Date.now() + ESPERA_CIERRE_MS;
    while (!haTerminado && Date.now() < limite) await dormir(50);
}

async function esperarAlServidor() {
    for (let i = 0; i < 60; i++) {
        if (haTerminado) return false;
        try {
            const r = await fetch(`http://localhost:${PUERTO}/api/v1/health`);
            if (r.ok) return true;
        } catch {
            /* todavía no escucha */
        }
        await dormir(500);
    }
    return false;
}

function ejecutarK6() {
    // `host.docker.internal` es cómo el contenedor alcanza el servidor de la máquina; en
    // Linux hay que añadir `--add-host=host.docker.internal:host-gateway`, que en Windows y
    // macOS sobra pero tampoco molesta.
    const argumentos = [
        "run",
        "--rm",
        "-i",
        "--add-host=host.docker.internal:host-gateway",
        "-e",
        `BASE_URL=http://host.docker.internal:${PUERTO}/api/v1`,
        "-e",
        `SIN_CALIENTE=${process.argv.includes("--sin-caliente") ? "1" : ""}`,
        "-v",
        `${__dirname}:/carga`,
        "grafana/k6",
        "run",
        "--summary-export=/carga/resultado.json",
        "/carga/movimientos.js",
    ];

    console.log(`\n$ docker ${argumentos.join(" ")}\n`);
    return spawnSync("docker", argumentos, { stdio: "inherit" }).status;
}

async function main() {
    console.log(`Backend contra «${BASE}» en el puerto ${PUERTO}…`);

    if (!(await esperarAlServidor())) {
        await detener();
        console.error(`✗ el backend no respondió\n--- salida ---\n${salida}`);
        process.exitCode = 1;
        return;
    }

    console.log("✓ backend listo");

    const codigo = ejecutarK6();
    await detener();

    if (codigo !== 0) {
        console.log("\n✗ k6 terminó con error: algún umbral no se cumplió o la prueba falló.");
        console.log("  El detalle está arriba, y el resumen en load/resultado.json");
    } else {
        console.log("\n✓ prueba de carga completada, todos los umbrales cumplidos");
    }

    process.exitCode = codigo;
}

main();
