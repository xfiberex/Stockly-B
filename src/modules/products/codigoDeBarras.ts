import { esLargoGtin } from "@/contratos/api";

/**
 * T5-08 — de un código a las barras de su etiqueta, sin librería.
 *
 * EAN-13, EAN-8 y Code 128 son tablas publicadas y un dígito de control: unas decenas de
 * líneas que se pueden leer enteras, frente a una dependencia de 12 MB que habría que pasar
 * por la auditoría para dibujar rectángulos. Lo que garantiza que están bien no es haberlas
 * copiado con cuidado, sino que `codigo-de-barras.test.ts` **las vuelve a leer con ZXing**, el
 * mismo motor que usa el escáner del frontend.
 *
 * El resultado es una cadena de módulos: `1` barra, `0` espacio, todos del mismo ancho.
 */

export type Simbologia = "EAN_13" | "EAN_8" | "CODE_128";

export interface Barras {
    simbologia: Simbologia;
    modulos: string;
    /** Módulos en blanco a cada lado. Sin ellos el lector no encuentra dónde empieza. */
    zonaSilenciosa: number;
}

// ─── EAN ─────────────────────────────────────────────────────────────────────

// Juegos L, G y R de cada dígito. R es L invertido y G es R al revés; se escriben los tres
// para que la tabla se pueda cotejar con la norma de un vistazo.
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

// EAN-13 no dibuja su primer dígito: lo codifica en qué juego (L o G) usa cada uno de los seis
// de la izquierda.
const PARIDAD_EAN_13 = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const GUARDA_LATERAL = "101";
const GUARDA_CENTRAL = "01010";

function ean13(codigo: string): string {
    const d = [...codigo].map(Number);
    const paridad = PARIDAD_EAN_13[d[0]!]!;
    const izquierda = d.slice(1, 7).map((n, i) => (paridad[i] === "L" ? EAN_L : EAN_G)[n]).join("");
    const derecha = d.slice(7).map((n) => EAN_R[n]).join("");
    return GUARDA_LATERAL + izquierda + GUARDA_CENTRAL + derecha + GUARDA_LATERAL;
}

function ean8(codigo: string): string {
    const d = [...codigo].map(Number);
    const izquierda = d.slice(0, 4).map((n) => EAN_L[n]).join("");
    const derecha = d.slice(4).map((n) => EAN_R[n]).join("");
    return GUARDA_LATERAL + izquierda + GUARDA_CENTRAL + derecha + GUARDA_LATERAL;
}

// ─── Code 128 ────────────────────────────────────────────────────────────────

/**
 * Anchos de barra y espacio de los 107 símbolos, alternando y empezando por barra. Cada uno
 * suma 11 módulos; el de parada (106) tiene siete elementos y suma 13.
 */
const CODE_128 = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const CAMBIO_A_C = 99;
const CAMBIO_A_B = 100;
const INICIO_B = 104;
const INICIO_C = 105;
const PARADA = 106;

function digitosSeguidos(texto: string, desde: number): number {
    let n = 0;
    while (desde + n < texto.length && texto[desde + n]! >= "0" && texto[desde + n]! <= "9") n++;
    return n;
}

/**
 * Los valores de los símbolos, con el de inicio delante y sin control ni parada. Juego B para
 * el texto y juego C —dos cifras por símbolo— para los tramos de dígitos que compensan el
 * cambio: al empezar, cuatro o más; en medio, seis o más, o cuatro si llegan hasta el final.
 * Un EAN interno de 20 cifras ocupa así la mitad de ancho, que en una etiqueta de 50 mm es la
 * diferencia entre leerse o no.
 */
export function valoresCode128(texto: string): number[] {
    const valores: number[] = [];
    let modo: "B" | "C" | null = null;
    let i = 0;

    while (i < texto.length) {
        let tramo = digitosSeguidos(texto, i);
        const compensa = modo === null ? tramo >= 4 : tramo >= 6 || (tramo >= 4 && i + tramo === texto.length);

        if (modo !== "C" && compensa) {
            // Un tramo impar deja su primera cifra en B: C solo codifica parejas.
            if (tramo % 2 === 1) {
                if (modo === null) valores.push(INICIO_B);
                modo = "B";
                valores.push(texto.charCodeAt(i) - 32);
                i++;
                tramo--;
            }
            valores.push(modo === null ? INICIO_C : CAMBIO_A_C);
            modo = "C";
        }

        if (modo === "C" && tramo >= 2) {
            valores.push(Number(texto.slice(i, i + 2)));
            i += 2;
            continue;
        }

        if (modo !== "B") valores.push(modo === null ? INICIO_B : CAMBIO_A_B);
        modo = "B";
        valores.push(texto.charCodeAt(i) - 32);
        i++;
    }
    return valores;
}

function code128(texto: string): string {
    const valores = valoresCode128(texto);
    // El control pondera cada símbolo por su posición; el de inicio cuenta con peso 1.
    const control = valores.reduce((suma, v, i) => suma + v * Math.max(i, 1), 0) % 103;
    return [...valores, control, PARADA]
        .map((v) => [...CODE_128[v]!].map((ancho, j) => (j % 2 === 0 ? "1" : "0").repeat(Number(ancho))).join(""))
        .join("");
}

// ─── Punto de entrada ────────────────────────────────────────────────────────

/**
 * Las barras de `codigo`. Un GTIN va en su simbología —EAN-13, o EAN-8— porque es la que
 * espera cualquier lector de caja; **UPC-A se imprime como EAN-13 con un cero delante**, que
 * son exactamente las mismas barras. El resto, Code 128. Los GTIN llegan ya validados
 * (`motivoCodigoDeBarrasInvalido`), así que aquí no se vuelve a comprobar el dígito de control.
 */
export function barrasDe(codigo: string): Barras {
    if (esLargoGtin(codigo) && codigo.length === 8) return { simbologia: "EAN_8", modulos: ean8(codigo), zonaSilenciosa: 7 };
    if (esLargoGtin(codigo)) {
        return { simbologia: "EAN_13", modulos: ean13(codigo.padStart(13, "0")), zonaSilenciosa: 11 };
    }
    return { simbologia: "CODE_128", modulos: code128(codigo), zonaSilenciosa: 10 };
}

/** Los tramos de barra como `[inicio, ancho]` en módulos: lo que se dibuja como rectángulos. */
export function tramosDeBarra(modulos: string): Array<[number, number]> {
    const tramos: Array<[number, number]> = [];
    for (const m of modulos.matchAll(/1+/g)) tramos.push([m.index, m[0].length]);
    return tramos;
}

/**
 * Las formas de escribir el mismo código que se buscan al escanear. Un UPC-A es un EAN-13 que
 * empieza por cero, y según el lector y los formatos activos llega con 12 cifras o con 13: sin
 * esto, el producto guardado de una forma no se encontraría leído de la otra.
 */
export function variantesDeBusqueda(codigo: string): string[] {
    if (/^\d{12}$/.test(codigo)) return [codigo, `0${codigo}`];
    if (/^0\d{12}$/.test(codigo)) return [codigo, codigo.slice(1)];
    return [codigo];
}
