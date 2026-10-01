import PDFDocument from "pdfkit";
import { barrasDe, tramosDeBarra, type Barras } from "@/modules/products/codigoDeBarras";
import { formatearImporte } from "@/shared/lib/moneda";

type Doc = InstanceType<typeof PDFDocument>;

/**
 * T5-08 — etiquetas imprimibles con el código de barras de cada producto.
 *
 * Dos formatos, porque son dos impresoras distintas:
 * - `sheet` — A4 de 3 × 8 etiquetas de 70 × 37 mm, el papel adhesivo más corriente para una
 *   impresora de oficina. Sin márgenes de hoja: el papel viene troquelado así.
 * - `label` — una etiqueta de 50 × 25 mm por página, para una impresora térmica de rollo.
 *
 * Las barras se dibujan como rectángulos vectoriales, así que la impresora las rasteriza a su
 * propia resolución y no a la de una imagen incrustada.
 */
export type FormatoEtiqueta = "sheet" | "label";

export interface Etiqueta {
    nombre: string;
    codigo: string;
    precio: number;
}

const MM = 72 / 25.4;

/**
 * El módulo —la barra más estrecha— más fino que se imprime: 0,2 mm.
 *
 * Por debajo, el código no se lee: dos píxeles de una impresora térmica de 203 ppp son
 * 0,25 mm, y una cámara de móvil a un palmo no resuelve mucho menos. **No es teórico:** el E2E
 * imprimió el SKU de 22 caracteres de su producto en una etiqueta de 50 mm, con barras de
 * 0,15 mm, y el escáner no lo encontró. El PDF se había generado sin decir nada.
 *
 * Con este mínimo caben 17 caracteres en Code 128 en la de rollo y 24 en la de hoja; los
 * tramos de cifras cuentan la mitad. Un código más largo se rechaza antes de empezar el PDF.
 */
const MODULO_MINIMO = 0.2 * MM;

interface Geometria {
    pagina: [number, number];
    columnas: number;
    filas: number;
    ancho: number;
    alto: number;
    relleno: number;
    letraNombre: number;
    letraCodigo: number;
    /** Tope del módulo: un código corto no se estira hasta ocupar la etiqueta entera. */
    moduloMaximo: number;
}

const GEOMETRIAS: Record<FormatoEtiqueta, Geometria> = {
    sheet: {
        pagina: [595.28, 841.89],
        columnas: 3,
        filas: 8,
        ancho: 70 * MM,
        alto: 37.125 * MM,
        // 5 mm: lo que la mayoría de impresoras de oficina no llega a imprimir junto al borde.
        relleno: 5 * MM,
        letraNombre: 9,
        letraCodigo: 8,
        moduloMaximo: 0.5 * MM,
    },
    label: {
        pagina: [50 * MM, 25 * MM],
        columnas: 1,
        filas: 1,
        ancho: 50 * MM,
        alto: 25 * MM,
        relleno: 2 * MM,
        letraNombre: 7,
        letraCodigo: 7,
        moduloMaximo: 0.4 * MM,
    },
};

export const ETIQUETAS_POR_PAGINA: Record<FormatoEtiqueta, number> = {
    sheet: GEOMETRIAS.sheet.columnas * GEOMETRIAS.sheet.filas,
    label: 1,
};

/**
 * El ancho de módulo de `barras` en `g`. Las barras caben en el ancho útil, y la zona
 * silenciosa puede ocupar el relleno —que ya es blanco— pero no salirse de la etiqueta.
 */
function anchoDeModulo(g: Geometria, barras: Barras): number {
    const util = g.ancho - g.relleno * 2;
    return Math.min(util / barras.modulos.length, g.ancho / (barras.modulos.length + barras.zonaSilenciosa * 2), g.moduloMaximo);
}

/** Si `codigo` se puede imprimir legible en `formato`. */
export function cabeEnEtiqueta(codigo: string, formato: FormatoEtiqueta): boolean {
    return anchoDeModulo(GEOMETRIAS[formato], barrasDe(codigo)) >= MODULO_MINIMO;
}

const precioDe = formatearImporte;

// Igual que en `reports.pdf.ts`: en pdfkit 0.18 `lineBreak: false` no evita el ajuste de línea.
function recortar(doc: Doc, texto: string, ancho: number): string {
    if (doc.widthOfString(texto) <= ancho) return texto;
    let t = texto;
    while (t.length > 1 && doc.widthOfString(t + "…") > ancho) t = t.slice(0, -1);
    return t.trimEnd() + "…";
}

function dibujarEtiqueta(doc: Doc, g: Geometria, x0: number, y0: number, etiqueta: Etiqueta) {
    const x = x0 + g.relleno;
    const ancho = g.ancho - g.relleno * 2;
    let y = y0 + g.relleno;

    // Nombre a la izquierda y precio a la derecha, en una línea.
    doc.font("Helvetica-Bold").fontSize(g.letraNombre).fillColor("#000000");
    const precio = precioDe(etiqueta.precio);
    const anchoPrecio = doc.widthOfString(precio);
    doc.text(precio, x + ancho - anchoPrecio, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(g.letraNombre);
    doc.text(recortar(doc, etiqueta.nombre, ancho - anchoPrecio - 4), x, y, { lineBreak: false });
    y += g.letraNombre + 3;

    const barras = barrasDe(etiqueta.codigo);
    const { modulos } = barras;
    const altoTexto = g.letraCodigo + 2;
    const altoBarras = y0 + g.alto - g.relleno - altoTexto - y;
    const modulo = anchoDeModulo(g, barras);
    const inicio = x + (ancho - modulos.length * modulo) / 2;

    for (const [desde, largo] of tramosDeBarra(modulos)) {
        doc.rect(inicio + desde * modulo, y, largo * modulo, altoBarras);
    }
    doc.fill("#000000");

    doc.font("Courier").fontSize(g.letraCodigo).fillColor("#000000");
    doc.text(etiqueta.codigo, x, y + altoBarras + 2, { width: ancho, align: "center", lineBreak: false });
}

/** Escribe las etiquetas en `doc`, en orden, llenando cada hoja por filas. */
export function renderEtiquetas(doc: Doc, etiquetas: Etiqueta[], formato: FormatoEtiqueta) {
    const g = GEOMETRIAS[formato];
    const porPagina = ETIQUETAS_POR_PAGINA[formato];

    etiquetas.forEach((etiqueta, i) => {
        const enPagina = i % porPagina;
        if (enPagina === 0) doc.addPage({ size: g.pagina, margin: 0 });
        const columna = enPagina % g.columnas;
        const fila = Math.floor(enPagina / g.columnas);
        dibujarEtiqueta(doc, g, columna * g.ancho, fila * g.alto, etiqueta);
    });
}

/** Un documento sin página inicial: `renderEtiquetas` añade cada una con su tamaño. */
export function nuevoDocumentoDeEtiquetas(): Doc {
    return new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: "Etiquetas — Stockly" } });
}
