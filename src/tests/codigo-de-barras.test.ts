import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { barrasDe, valoresCode128, variantesDeBusqueda } from "@/modules/products/codigoDeBarras";
import { digitoDeControlGtin, motivoCodigoDeBarrasInvalido } from "@/contratos/api";

/**
 * T5-08 — el codificador de barras, **leído de vuelta con ZXing**: el motor que usa el
 * escáner del frontend (`barcode-detector` cuando el navegador no trae uno nativo). Una tabla
 * con un símbolo mal copiado da barras que parecen barras y no se leen; comparar cadenas de
 * módulos con otras cadenas copiadas a mano no lo habría detectado.
 */

prepareZXingModule({
    overrides: { wasmBinary: readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer },
    fireImmediately: true,
});

/** Un PNG en escala de grises con las barras, 3 px por módulo y su zona silenciosa. */
function pngDe(modulos: string, zona: number): Uint8Array {
    const escala = 3;
    const alto = 60;
    const fila = ("0".repeat(zona) + modulos + "0".repeat(zona))
        .split("")
        .flatMap((m) => Array<number>(escala).fill(m === "1" ? 0 : 255));
    const ancho = fila.length;
    const crudo = Buffer.concat(Array.from({ length: alto }, () => Buffer.from([0, ...fila])));

    const trozo = (tipo: string, datos: Buffer) => {
        const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
        const largo = Buffer.alloc(4);
        largo.writeUInt32BE(datos.length);
        const control = Buffer.alloc(4);
        control.writeUInt32BE(crc32(cuerpo));
        return Buffer.concat([largo, cuerpo, control]);
    };
    const cabecera = Buffer.alloc(13);
    cabecera.writeUInt32BE(ancho, 0);
    cabecera.writeUInt32BE(alto, 4);
    cabecera[8] = 8; // bits por muestra
    cabecera[9] = 0; // escala de grises
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        trozo("IHDR", cabecera),
        trozo("IDAT", deflateSync(crudo)),
        trozo("IEND", Buffer.alloc(0)),
    ]);
}

async function leer(codigo: string) {
    const barras = barrasDe(codigo);
    const [leido] = await readBarcodes(pngDe(barras.modulos, barras.zonaSilenciosa), {
        formats: ["EAN-13", "EAN-8", "UPC-A", "Code128"],
        tryHarder: false,
    });
    return { simbologia: barras.simbologia, formato: leido?.format, texto: leido?.text };
}

describe("Código de barras — se vuelve a leer (T5-08)", () => {
    it.each([
        ["4006381333931", "EAN_13", "EAN13"],
        ["8412345678905", "EAN_13", "EAN13"],
        ["96385074", "EAN_8", "EAN8"],
    ])("un GTIN %s va en su simbología y se lee igual", async (codigo, simbologia, formato) => {
        await expect(leer(codigo)).resolves.toEqual({ simbologia, formato, texto: codigo });
    });

    // El primer dígito de un EAN-13 no se dibuja: decide la paridad de los seis siguientes. Uno
    // por cada valor, o una fila mal copiada de `PARIDAD_EAN_13` pasa sin que nada falle.
    it.each([..."0123456789"])("EAN-13 que empieza por %s", async (primero) => {
        const cuerpo = `${primero}12345678901`;
        const codigo = cuerpo + digitoDeControlGtin(cuerpo);
        await expect(leer(codigo)).resolves.toMatchObject({ simbologia: "EAN_13", texto: codigo });
    });

    it("un UPC-A se imprime como EAN-13 con un cero delante, y así vuelve: por eso se busca de las dos formas", async () => {
        // Con UPC-A entre los formatos, ZXing lo lee como EAN-13 de 13 cifras. Otro lector —o el
        // nativo de Android— puede darlo con 12: `variantesDeBusqueda` encuentra el producto
        // guardado de cualquiera de las dos maneras.
        await expect(leer("036000291452")).resolves.toEqual({ simbologia: "EAN_13", formato: "EAN13", texto: "0036000291452" });
        expect(variantesDeBusqueda("0036000291452")).toContain("036000291452");
    });

    it.each([
        "PER-LOG-MX3",
        "a",
        "Z9",
        "1234",
        "12345",
        "SKU-000123456789-X",
        "AB1234567890123456CD",
        "~!{}|`^_",
        "X".repeat(48),
    ])("Code 128 «%s» se lee tal cual", async (codigo) => {
        await expect(leer(codigo)).resolves.toEqual({ simbologia: "CODE_128", formato: "Code128", texto: codigo });
    });

    it("los tramos de cifras van en el juego C: la etiqueta de un código numérico largo cabe", () => {
        // Inicio C + 10 parejas, frente a inicio B + 20 caracteres.
        expect(valoresCode128("12345678901234567890")).toHaveLength(11);
        // Tramo impar al principio: la primera cifra en B y el resto en C.
        expect(valoresCode128("12345")).toEqual([104, 17, 99, 23, 45]);
        // Dos cifras sueltas en medio no compensan el cambio de juego.
        expect(valoresCode128("A12B")).toEqual([104, 33, 17, 18, 34]);
    });
});

describe("Código de barras — reglas del contrato (T5-08)", () => {
    it("el dígito de control GTIN sirve para los tres largos", () => {
        expect(digitoDeControlGtin("400638133393")).toBe(1);
        expect(digitoDeControlGtin("03600029145")).toBe(2);
        expect(digitoDeControlGtin("9638507")).toBe(4);
    });

    it.each([
        ["4006381333931", null],
        ["4006381333932", "digitoDeControl"],
        ["036000291453", "digitoDeControl"],
        ["96385075", "digitoDeControl"],
        // Solo dígitos pero con un largo que no es GTIN: código interno, sin control.
        ["1234567", null],
        ["12345678901234", null],
        ["PER-LOG-MX3", null],
        ["con espacio", "caracteres"],
        ["ñandú", "caracteres"],
        ["", "largo"],
        ["X".repeat(49), "largo"],
    ])("«%s» → %s", (codigo, motivo) => {
        expect(motivoCodigoDeBarrasInvalido(codigo)).toBe(motivo);
    });

    it("un UPC-A se busca también con el cero delante, y al revés", () => {
        expect(variantesDeBusqueda("036000291452")).toEqual(["036000291452", "0036000291452"]);
        expect(variantesDeBusqueda("0036000291452")).toEqual(["0036000291452", "036000291452"]);
        expect(variantesDeBusqueda("4006381333931")).toEqual(["4006381333931"]);
        expect(variantesDeBusqueda("PER-1")).toEqual(["PER-1"]);
    });
});
