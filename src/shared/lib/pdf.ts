import PDFDocument from "pdfkit";

/**
 * Lo que comparten los PDF en A4 —los informes y el comprobante de venta (T6-07)—: la paleta,
 * los márgenes y el recorte de texto. Vivía dentro de `reports.pdf.ts`; el comprobante habría
 * sido la segunda copia.
 */
export type Doc = InstanceType<typeof PDFDocument>;

// ─── Paleta minimalista: escala de grises + un único acento de marca ─────────
export const INK = "#111827"; // gray-900 — títulos y valores destacados
export const BODY = "#374151"; // gray-700 — texto normal de tablas
export const MUTED = "#9ca3af"; // gray-400 — etiquetas y datos secundarios
export const FAINT = "#6b7280"; // gray-500 — fecha y pie
export const LINE = "#d1d5db"; // gray-300 — líneas finas
export const ACCENT = "#2563eb"; // blue-600 — solo el logotipo
export const CRIT = "#b91c1c"; // red-700 — reservado a lo crítico (agotado / urgente / anulada)

// ─── Geometría ──────────────────────────────────────────────────────────────
export const MARGIN = 40;
export const PAGE_W = 595.28; // A4
export const CONTENT_W = PAGE_W - MARGIN * 2; // 515.28

// Trunca a una sola línea que quepa en `maxWidth`. En pdfkit 0.18 `lineBreak:false`
// no evita el ajuste de línea, así que recortamos a mano (usa la métrica de la
// fuente activa, por lo que debe llamarse tras fijar fuente y tamaño).
export function fitText(doc: Doc, text: string, maxWidth: number): string {
    if (maxWidth <= 4 || doc.widthOfString(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(t + "…") > maxWidth) t = t.slice(0, -1);
    return t.replace(/\s+$/, "") + "…";
}

/** Dónde deja de caber contenido: debajo va el pie. */
export function bottom(doc: Doc): number {
    return doc.page.height - 48;
}

export function hairline(doc: Doc, y: number, width = 0.75, color = LINE) {
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(width).strokeColor(color).stroke();
}
