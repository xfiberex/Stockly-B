import PDFDocument from "pdfkit";
import { escribirNumeroDeVenta, type Negocio } from "@/contratos/api";
import { logger } from "@/shared/lib/logger";
import { formatearImporte } from "@/shared/lib/moneda";
import { BODY, CONTENT_W, CRIT, FAINT, INK, LINE, MARGIN, MUTED, bottom, fitText, hairline, type Doc } from "@/shared/lib/pdf";

/**
 * T6-07 — el comprobante de una venta: el papel que se le da a quien compra.
 *
 * **Es un comprobante interno, sin valor fiscal, y lo dice** —en la cabecera y en el pie de
 * cada página—. Se decidió el 2026-10-05, y es temporal: darle valor fiscal es otra tarea, con
 * otro número y otra serie. Hasta entonces este archivo no escribe el nombre de ningún
 * documento fiscal, y un test lo vigila.
 *
 * Sale en español, como el resto de lo que se exporta, y en A4. **Aquí no se calcula nada**:
 * los importes llegan hechos de `conTotales`, que es lo mismo que enseña la pantalla.
 *
 * Lo que no hay no deja hueco: sin datos del negocio no hay bloque del negocio, sin cliente no
 * hay bloque del cliente, y sin impuesto el pie es solo el total, como en la pantalla.
 */

export const TITULO_DEL_COMPROBANTE = "Comprobante de venta";
export const LEYENDA_SIN_VALOR_FISCAL = "Documento sin valor fiscal";
export const MARCA_DE_ANULADA = "ANULADA";

/** Una línea de la venta, con sus importes ya calculados (`conTotales`). */
interface LineaDelComprobante {
    productName: string;
    quantity: number;
    unitPrice: { toString(): string };
    taxRate: number | null;
    subtotal: string;
}

export interface DatosDelComprobante {
    negocio: Negocio;
    /** El logo ya descargado, o `null`: sin logo, o no se pudo traer. */
    logo: Buffer | null;
    /** La zona del negocio: en ella se escribe la fecha. */
    zonaHoraria: string;
    orden: {
        number: number;
        status: string;
        shippedAt: Date | null;
        createdAt: Date;
        customerName: string | null;
        customerEmail: string | null;
        customerPhone: string | null;
        customerDocument: string | null;
        createdByEmail: string | null;
        items: LineaDelComprobante[];
        subtotal: string;
        tax: string;
        total: string;
    };
}

/** La caja máxima del logo: ancho de sobra para uno apaisado, sin que uno cuadrado se coma la cabecera. */
const LOGO_ANCHO = 140;
const LOGO_ALTO = 56;

const ANCHO_IZQUIERDA = 300;
const ANCHO_DERECHA = 195;

const COLUMNAS = [
    { titulo: "Descripción", ancho: 275.28, alinear: "left" },
    { titulo: "Cant.", ancho: 60, alinear: "right" },
    { titulo: "Precio unit.", ancho: 90, alinear: "right" },
    { titulo: "Importe", ancho: 90, alinear: "right" },
] as const;

/**
 * Un texto libre en una sola línea. El nombre de un cliente o de un producto puede traer saltos
 * de línea o tabuladores, y aquí cada dato ocupa el sitio que se le ha medido.
 */
const unaLinea = (texto: string) => texto.replace(/\p{Cc}+/gu, " ").trim();

/** `null`, vacío o solo espacios no son un dato: no se pintan, y no dejan su rótulo. */
const dato = (texto: string | null | undefined) => (texto ? unaLinea(texto) : "");

/**
 * La fecha de la venta en la zona del negocio: «8 de octubre de 2026 a las 14:35». En 24 horas: el
 * «p. m.» de `es-MX` lleva un espacio estrecho que las fuentes estándar del PDF no tienen.
 */
export function fechaDelComprobante(fecha: Date, zonaHoraria: string): string {
    return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", hourCycle: "h23", timeZone: zonaHoraria })
        .format(fecha)
        .replace(/[  ]/g, " ");
}

/**
 * El rótulo del impuesto: su nombre de Configuración —o el genérico— y la tasa, si todas las
 * líneas que lo llevan comparten una. Es la misma regla que `PieDeImportes`, en la interfaz.
 */
export function rotuloDelImpuesto(nombre: string, lineas: Array<{ taxRate: number | null }>): string {
    const rotulo = dato(nombre) || "Impuesto";
    const tasas = new Set(lineas.flatMap((linea) => (linea.taxRate ? [linea.taxRate] : [])));
    const [tasa] = tasas;
    return tasas.size === 1 && tasa !== undefined ? `${rotulo} (${tasa} %)` : rotulo;
}

/** El documento, vacío: A4, con las páginas en memoria para poder numerarlas al final. */
export function nuevoDocumentoDeComprobante(numero: number): Doc {
    return new PDFDocument({
        margin: MARGIN,
        size: "A4",
        bufferPages: true,
        info: { Title: `${TITULO_DEL_COMPROBANTE} ${escribirNumeroDeVenta(numero)}` },
    });
}

/** Pinta el logo y devuelve cuánto alto ocupó; 0 si no hay o si PDFKit no lo entiende. */
function dibujarLogo(doc: Doc, logo: Buffer | null, x: number, y: number): number {
    if (!logo) return 0;
    try {
        // `openImage` existe en PDFKit y no en sus tipos: abre la imagen sin pintarla, que es lo
        // que hace falta para saber cuánto va a ocupar.
        const imagen = (doc as Doc & { openImage(origen: Buffer): { width: number; height: number } }).openImage(logo);
        const escala = Math.min(LOGO_ANCHO / imagen.width, LOGO_ALTO / imagen.height);
        doc.image(logo, x, y, { width: imagen.width * escala });
        return imagen.height * escala;
    } catch (err) {
        // La firma era de PNG o de JPEG y el resto no: el comprobante sale igualmente.
        logger.warn({ err }, "El logo del negocio no se pudo incrustar en el comprobante");
        return 0;
    }
}

/** Escribe `texto` ajustado a `ancho` y devuelve la `y` que queda debajo. */
function parrafo(doc: Doc, texto: string, x: number, y: number, ancho: number, alinear: "left" | "right" = "left"): number {
    doc.text(texto, x, y, { width: ancho, align: alinear });
    return y + doc.heightOfString(texto, { width: ancho });
}

/** Quién vende, a la izquierda. Devuelve dónde termina. */
function dibujarNegocio(doc: Doc, { negocio, logo }: DatosDelComprobante, y: number): number {
    const x = MARGIN;
    const altoLogo = dibujarLogo(doc, logo, x, y);
    if (altoLogo > 0) y += altoLogo + 8;

    const nombre = dato(negocio.name);
    if (nombre) {
        doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
        y = parrafo(doc, nombre, x, y, ANCHO_IZQUIERDA) + 2;
    }

    doc.font("Helvetica").fontSize(9).fillColor(FAINT);
    for (const linea of [dato(negocio.taxId), dato(negocio.address), dato(negocio.phone), dato(negocio.email)]) {
        if (linea) y = parrafo(doc, linea, x, y, ANCHO_IZQUIERDA) + 1;
    }
    return y;
}

/** Qué papel es, a la derecha: título, número, fecha y la leyenda. Devuelve dónde termina. */
function dibujarTitulo(doc: Doc, { orden, zonaHoraria }: DatosDelComprobante, y: number): number {
    const x = MARGIN + CONTENT_W - ANCHO_DERECHA;
    const derecha = { width: ANCHO_DERECHA, align: "right", lineBreak: false } as const;

    doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(TITULO_DEL_COMPROBANTE, x, y, derecha);
    y += 21;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BODY).text(`Nº ${escribirNumeroDeVenta(orden.number)}`, x, y, derecha);
    y += 16;
    // La fecha de la venta es la del envío, que es cuando lo fue; la de creación es la de la orden.
    doc.font("Helvetica").fontSize(9).fillColor(FAINT)
        .text(fechaDelComprobante(orden.shippedAt ?? orden.createdAt, zonaHoraria), x, y, derecha);
    y += 13;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(LEYENDA_SIN_VALOR_FISCAL, x, y, derecha);
    y += 12;

    if (orden.status === "CANCELLED") {
        y += 4;
        doc.font("Helvetica-Bold").fontSize(12).fillColor(CRIT).text(MARCA_DE_ANULADA, x, y, { ...derecha, characterSpacing: 1 });
        y += 16;
    }
    return y;
}

/** A quién se vendió y quién lo registró. Sin ninguno de los dos, no pinta nada. */
function dibujarCliente(doc: Doc, { orden }: DatosDelComprobante, y: number): number {
    const documento = dato(orden.customerDocument);
    const cliente = [
        dato(orden.customerName),
        documento && `Documento: ${documento}`,
        dato(orden.customerEmail),
        dato(orden.customerPhone),
    ].filter(Boolean);
    const vendedor = dato(orden.createdByEmail);
    if (cliente.length === 0 && !vendedor) return y;

    const rotulo = (texto: string, x: number, ancho: number, alinear: "left" | "right") =>
        doc.font("Helvetica").fontSize(7).fillColor(MUTED)
            .text(texto.toUpperCase(), x, y, { width: ancho, align: alinear, characterSpacing: 0.4, lineBreak: false });

    let finCliente = y;
    if (cliente.length > 0) {
        rotulo("Cliente", MARGIN, ANCHO_IZQUIERDA, "left");
        finCliente = y + 12;
        cliente.forEach((linea, i) => {
            // La primera línea es el nombre si lo hay; sin él, ninguna va en negrita.
            const esNombre = i === 0 && linea === dato(orden.customerName);
            doc.font(esNombre ? "Helvetica-Bold" : "Helvetica").fontSize(esNombre ? 10 : 9).fillColor(esNombre ? INK : BODY);
            finCliente = parrafo(doc, linea, MARGIN, finCliente, ANCHO_IZQUIERDA) + 1;
        });
    }

    let finVendedor = y;
    if (vendedor) {
        const x = MARGIN + CONTENT_W - ANCHO_DERECHA;
        rotulo("Registrada por", x, ANCHO_DERECHA, "right");
        doc.font("Helvetica").fontSize(9).fillColor(BODY);
        finVendedor = parrafo(doc, vendedor, x, y + 12, ANCHO_DERECHA, "right") + 1;
    }

    const fin = Math.max(finCliente, finVendedor) + 12;
    hairline(doc, fin);
    return fin + 14;
}

function dibujarEncabezadoDeTabla(doc: Doc, y: number): number {
    let x = MARGIN;
    doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED);
    for (const columna of COLUMNAS) {
        doc.text(columna.titulo.toUpperCase(), x + 8, y + 2, { width: columna.ancho - 16, align: columna.alinear, characterSpacing: 0.3, lineBreak: false });
        x += columna.ancho;
    }
    hairline(doc, y + 15);
    return y + 21;
}

/**
 * Las líneas. La descripción **no se recorta**: se ajusta al ancho y la fila crece, porque en un
 * comprobante lo que se vendió tiene que leerse entero. Una fila nunca se parte entre dos páginas.
 */
function dibujarLineas(doc: Doc, { orden, negocio }: DatosDelComprobante, y: number): number {
    const importe = (n: string) => formatearImporte(Number(n), negocio.currencySymbol);
    const [descripcion, cantidad, precio, total] = COLUMNAS;

    y = dibujarEncabezadoDeTabla(doc, y);

    for (const linea of orden.items) {
        const nombre = unaLinea(linea.productName);
        doc.font("Helvetica").fontSize(9);
        const alto = Math.max(doc.heightOfString(nombre, { width: descripcion.ancho - 16 }), 10) + 12;

        if (y + alto > bottom(doc)) {
            doc.addPage();
            y = dibujarEncabezadoDeTabla(doc, MARGIN);
        }

        let x = MARGIN;
        doc.font("Helvetica").fontSize(9).fillColor(INK).text(nombre, x + 8, y + 6, { width: descripcion.ancho - 16 });
        x += descripcion.ancho;

        const celda = (texto: string, ancho: number, color: string, negrita = false) => {
            doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(color);
            doc.text(fitText(doc, texto, ancho - 16), x + 8, y + 6, { width: ancho - 16, align: "right", lineBreak: false });
            x += ancho;
        };
        celda(String(linea.quantity), cantidad.ancho, BODY);
        celda(importe(linea.unitPrice.toString()), precio.ancho, BODY);
        celda(importe(linea.subtotal), total.ancho, INK, true);

        y += alto;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor(LINE).stroke();
    }
    return y;
}

/** Subtotal, impuesto y total, a la derecha. Los tres van juntos: no se parten entre páginas. */
function dibujarTotales(doc: Doc, { orden, negocio }: DatosDelComprobante, y: number): number {
    const importe = (n: string) => formatearImporte(Number(n), negocio.currencySymbol);
    const conImpuesto = Number(orden.tax) > 0;
    const filas: Array<{ rotulo: string; valor: string; destacada?: boolean }> = [
        ...(conImpuesto
            ? [
                { rotulo: "Subtotal", valor: importe(orden.subtotal) },
                { rotulo: rotuloDelImpuesto(negocio.taxName, orden.items), valor: importe(orden.tax) },
            ]
            : []),
        { rotulo: "Total", valor: importe(orden.total), destacada: true },
    ];

    const ANCHO_ROTULO = 150;
    const ANCHO_VALOR = 120;
    const x = MARGIN + CONTENT_W - ANCHO_ROTULO - ANCHO_VALOR;

    y += 10;
    if (y + filas.length * 18 + 8 > bottom(doc)) {
        doc.addPage();
        y = MARGIN;
    }

    for (const fila of filas) {
        if (fila.destacada && conImpuesto) {
            doc.moveTo(x, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.75).strokeColor(LINE).stroke();
            y += 6;
        }
        const tamano = fila.destacada ? 12 : 9;
        doc.font(fila.destacada ? "Helvetica-Bold" : "Helvetica").fontSize(tamano).fillColor(fila.destacada ? INK : FAINT);
        doc.text(fitText(doc, fila.rotulo, ANCHO_ROTULO - 8), x, y, { width: ANCHO_ROTULO - 8, align: "right", lineBreak: false });
        doc.font(fila.destacada ? "Helvetica-Bold" : "Helvetica").fontSize(tamano).fillColor(fila.destacada ? INK : BODY);
        doc.text(fitText(doc, fila.valor, ANCHO_VALOR - 8), x + ANCHO_ROTULO, y, { width: ANCHO_VALOR - 8, align: "right", lineBreak: false });
        y += fila.destacada ? 20 : 16;
    }
    return y;
}

/** El pie de cada página: qué papel es, que no tiene valor fiscal y, si lo está, que está anulado. */
function dibujarPies(doc: Doc, { orden }: DatosDelComprobante) {
    const partes = [`${TITULO_DEL_COMPROBANTE} Nº ${escribirNumeroDeVenta(orden.number)}`, LEYENDA_SIN_VALOR_FISCAL];
    if (orden.status === "CANCELLED") partes.push(MARCA_DE_ANULADA);
    const pie = partes.join(" · ");

    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
        doc.switchToPage(i);
        // El pie va en la zona de margen inferior; sin esto pdfkit añade una página en blanco
        // por cada pie al creer que el texto no cabe (igual que en `reports.pdf.ts`).
        const margenInferior = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const y = doc.page.height - 32;
        hairline(doc, y - 7);
        doc.font("Helvetica").fontSize(8).fillColor(FAINT).text(pie, MARGIN, y, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(FAINT)
            .text(`Página ${i - rango.start + 1} de ${rango.count}`, MARGIN, y, { width: CONTENT_W, align: "right", lineBreak: false });

        doc.page.margins.bottom = margenInferior;
    }
}

export function renderComprobante(doc: Doc, datos: DatosDelComprobante) {
    const finNegocio = dibujarNegocio(doc, datos, MARGIN);
    const finTitulo = dibujarTitulo(doc, datos, MARGIN);

    let y = Math.max(finNegocio, finTitulo) + 12;
    hairline(doc, y);
    y += 16;

    y = dibujarCliente(doc, datos, y);
    y = dibujarLineas(doc, datos, y);
    dibujarTotales(doc, datos, y);
    dibujarPies(doc, datos);
}
