// Arranca el artefacto compilado y comprueba que responde.
//
// Es el único paso de `pnpm verify` que detecta la clase de fallo de T0-01: `tsc`
// no reescribe los alias `@/`, así que un build que compila puede seguir sin
// arrancar. Solo ejecutar `dist/server.js` de verdad lo demuestra.
//
// Usa un puerto propio (SMOKE_PORT, 3100 por defecto) para no chocar con el
// servidor de desarrollo si está levantado.

const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = process.env.SMOKE_PORT ?? "3100";
const URL_SALUD = `http://localhost:${PORT}/api/v1/health`;
const INTENTOS = 30;
const ESPERA_MS = 1000;
const ESPERA_CIERRE_MS = 5000;

const entrada = path.join(__dirname, "..", "dist", "server.js");

const servidor = spawn(process.execPath, [entrada], {
    env: { ...process.env, PORT, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
});

let salida = "";
servidor.stdout.on("data", (trozo) => (salida += trozo));
servidor.stderr.on("data", (trozo) => (salida += trozo));

let haTerminado = false;
servidor.on("exit", () => (haTerminado = true));

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cierra el hijo y espera a que muera de verdad. En Windows, llamar a
// process.exit() con el proceso hijo aún cerrándose aborta libuv
// («Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)») y devuelve un
// código de salida sin sentido aunque la comprobación haya pasado. Por eso aquí
// se espera al evento 'exit' y se usa process.exitCode en lugar de process.exit().
async function detenerServidor() {
    if (haTerminado) return;

    servidor.kill();

    const limite = Date.now() + ESPERA_CIERRE_MS;
    while (!haTerminado && Date.now() < limite) {
        await dormir(50);
    }
}

async function terminar(codigo, mensaje) {
    await detenerServidor();

    console.log(mensaje);
    if (codigo !== 0 && salida) console.log(`\n--- salida del servidor ---\n${salida}`);

    process.exitCode = codigo;
}

async function main() {
    for (let intento = 0; intento < INTENTOS; intento++) {
        if (haTerminado) {
            return terminar(1, "✗ el proceso terminó durante el arranque");
        }

        try {
            const respuesta = await fetch(URL_SALUD);
            if (respuesta.ok) {
                return terminar(0, `✓ GET /api/v1/health responde ${respuesta.status}`);
            }
        } catch {
            // El servidor todavía no escucha: reintentar.
        }

        await dormir(ESPERA_MS);
    }

    return terminar(1, `✗ /api/v1/health no respondió en ${(INTENTOS * ESPERA_MS) / 1000} s`);
}

main();
