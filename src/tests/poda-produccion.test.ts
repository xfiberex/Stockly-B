import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * T4-14 — la poda del árbol de producción de la imagen.
 *
 * Se prueba sobre un almacén de pnpm **falso pero con su forma real**: `.pnpm/<paquete>/
 * node_modules/<paquete>` para el contenido, y junto a él enlaces a las dependencias. Es lo
 * que recorre el guion, y montarlo aquí permite comprobar la regla —cortar los dos peers y
 * barrer lo inalcanzable— sin construir una imagen de 400 MB por cada caso.
 *
 * Lo que importa que no se rompa es **lo que sobrevive**. Una poda que se pasa de lista no
 * falla en el build: falla al arrancar el contenedor, y solo en la ruta de código que
 * importaba el paquete que ya no está.
 */

const GUION = path.join(__dirname, "..", "..", "scripts", "podar-produccion.js");

let raiz: string;
let modulos: string;
let almacen: string;

/** Crea una entrada del almacén con su contenido. */
function paquete(entrada: string, nombre: string) {
    const dir = path.join(almacen, entrada, "node_modules", nombre);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
}

/** Enlaza `desde` (una entrada del almacén, o la raíz) a otra entrada. */
function enlazar(desde: string | null, nombre: string, entrada: string) {
    const base = desde === null ? modulos : path.join(almacen, desde, "node_modules");
    fs.mkdirSync(path.dirname(path.join(base, nombre)), { recursive: true });
    fs.symlinkSync(path.join(almacen, entrada, "node_modules", nombre), path.join(base, nombre), "junction");
}

const entradas = () => fs.readdirSync(almacen).sort();

beforeEach(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), "poda-"));
    modulos = path.join(raiz, "node_modules");
    almacen = path.join(modulos, ".pnpm");
    fs.mkdirSync(almacen, { recursive: true });
});

afterEach(() => {
    fs.rmSync(raiz, { recursive: true, force: true });
});

function podar() {
    return execFileSync(process.execPath, [GUION], {
        cwd: raiz,
        env: { ...process.env, PODA_RAIZ: "node_modules" },
        encoding: "utf8",
    });
}

describe("Poda del árbol de producción (T4-14)", () => {
    it("corta el CLI de Prisma y con él todo lo que solo colgaba de él", () => {
        // El árbol real, en pequeño: el cliente es una dependencia de verdad y arrastra al
        // CLI como **peer opcional**; de ahí cuelga la interfaz gráfica y su árbol.
        paquete("@prisma+client@7.9.1", "@prisma/client");
        paquete("prisma@7.9.1", "prisma");
        paquete("@prisma+studio-core@0.33.0", "@prisma/studio-core");
        paquete("elkjs@0.11.1", "elkjs");
        enlazar(null, "@prisma/client", "@prisma+client@7.9.1");
        enlazar("@prisma+client@7.9.1", "prisma", "prisma@7.9.1");
        enlazar("prisma@7.9.1", "@prisma/studio-core", "@prisma+studio-core@0.33.0");
        enlazar("@prisma+studio-core@0.33.0", "elkjs", "elkjs@0.11.1");

        podar();

        // `elkjs` está a tres saltos y nadie lo nombra en el guion: se va porque deja de ser
        // alcanzable, que es justo lo que una lista escrita a mano no consigue.
        expect(entradas()).toEqual(["@prisma+client@7.9.1"]);
    });

    it("no toca lo que el servidor sí puede importar", () => {
        paquete("express@5.2.1", "express");
        paquete("body-parser@2.0.0", "body-parser");
        paquete("pg@8.23.0", "pg");
        enlazar(null, "express", "express@5.2.1");
        enlazar(null, "pg", "pg@8.23.0");
        enlazar("express@5.2.1", "body-parser", "body-parser@2.0.0");

        podar();

        // Incluida la transitiva, que no está enlazada en la raíz y aun así hace falta.
        expect(entradas()).toEqual(["body-parser@2.0.0", "express@5.2.1", "pg@8.23.0"]);
    });

    it("conserva un paquete compartido entre el CLI y una dependencia real", () => {
        // El caso que rompería una poda por lista: `pako` cuelga de la interfaz gráfica **y**
        // de una dependencia legítima. Borrarlo por venir de la primera deja el servidor sin
        // la segunda, y no se nota hasta que se ejecuta esa ruta.
        paquete("prisma@7.9.1", "prisma");
        paquete("pdfkit@0.18.0", "pdfkit");
        paquete("pako@2.1.0", "pako");
        enlazar(null, "pdfkit", "pdfkit@0.18.0");
        enlazar("pdfkit@0.18.0", "pako", "pako@2.1.0");
        enlazar("prisma@7.9.1", "pako", "pako@2.1.0");

        podar();

        expect(entradas()).toEqual(["pako@2.1.0", "pdfkit@0.18.0"]);
    });

    it("`--simular` dice qué haría y no borra nada", () => {
        paquete("prisma@7.9.1", "prisma");
        paquete("express@5.2.1", "express");
        enlazar(null, "express", "express@5.2.1");

        const salida = execFileSync(process.execPath, [GUION, "--simular"], {
            cwd: raiz,
            env: { ...process.env, PODA_RAIZ: "node_modules" },
            encoding: "utf8",
        });

        expect(salida).toContain("se borrarían");
        expect(entradas()).toEqual(["express@5.2.1", "prisma@7.9.1"]);
    });

    it("un ciclo entre paquetes no lo cuelga", () => {
        // Se dan de verdad, y un recorrido sin marca de visitados se queda dando vueltas
        // dentro del build, donde no hay nadie mirando.
        paquete("a@1.0.0", "a");
        paquete("b@1.0.0", "b");
        enlazar(null, "a", "a@1.0.0");
        enlazar("a@1.0.0", "b", "b@1.0.0");
        enlazar("b@1.0.0", "a", "a@1.0.0");

        podar();

        expect(entradas()).toEqual(["a@1.0.0", "b@1.0.0"]);
    });
});
