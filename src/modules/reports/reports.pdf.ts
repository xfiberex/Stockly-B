import PDFDocument from "pdfkit";
import type { ReportSummary } from "./reports.service";

type Doc = InstanceType<typeof PDFDocument>;

// ─── Paleta minimalista: escala de grises + un único acento de marca ─────────
const INK = "#111827"; // gray-900 — títulos y valores destacados
const BODY = "#374151"; // gray-700 — texto normal de tablas
const MUTED = "#9ca3af"; // gray-400 — etiquetas y datos secundarios
const FAINT = "#6b7280"; // gray-500 — fecha y pie
const LINE = "#d1d5db"; // gray-300 — líneas finas
const ACCENT = "#2563eb"; // blue-600 — solo el logotipo
const CRIT = "#b91c1c"; // red-700 — reservado a lo crítico (agotado / urgente)

// ─── Geometría ──────────────────────────────────────────────────────────────
const MARGIN = 40;
const PAGE_W = 595.28; // A4
const CONTENT_W = PAGE_W - MARGIN * 2; // 515.28

// ─── Formato ──────────────────────────────────────────────────────────────
const money = (n: number) =>
    `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
const int = (n: number) => n.toLocaleString("es-MX");

// Trunca a una sola línea que quepa en `maxWidth`. En pdfkit 0.18 `lineBreak:false`
// no evita el ajuste de línea, así que recortamos a mano (usa la métrica de la
// fuente activa, por lo que debe llamarse tras fijar fuente y tamaño).
function fitText(doc: Doc, text: string, maxWidth: number): string {
    if (maxWidth <= 4 || doc.widthOfString(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(t + "…") > maxWidth) t = t.slice(0, -1);
    return t.replace(/\s+$/, "") + "…";
}

// ─── Modelo de celda / tabla ────────────────────────────────────────────────
interface Cell {
    text: string;
    sub?: string; // segunda línea atenuada (p.ej. el SKU)
    color?: string;
    bold?: boolean;
    mono?: boolean;
    align?: "left" | "right";
}
type RawCell = string | Cell;
interface Column {
    header: string;
    width: number;
    align?: "left" | "right";
}
interface Row {
    cells: RawCell[];
    topRule?: boolean; // línea superior más marcada (fila de totales)
}

const cell = (c: RawCell): Cell => (typeof c === "string" ? { text: c } : c);

function bottom(doc: Doc): number {
    return doc.page.height - 48;
}
function ensureSpace(doc: Doc, y: number, needed: number): number {
    if (y + needed > bottom(doc)) {
        doc.addPage();
        return MARGIN;
    }
    return y;
}
function hairline(doc: Doc, y: number, width = 0.75, color = LINE) {
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(width).strokeColor(color).stroke();
}

// ─── Cabecera ────────────────────────────────────────────────────────────────
function drawHeader(doc: Doc, generatedAt: string): number {
    const x = MARGIN;
    const top = MARGIN;

    doc.font("Helvetica-Bold").fontSize(14).fillColor(ACCENT).text("Stockly", x, top, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(FAINT)
        .text(`Generado el ${generatedAt}`, x, top + 2, { width: CONTENT_W, align: "right", lineBreak: false });

    const titleY = top + 26;
    doc.font("Helvetica-Bold").fontSize(19).fillColor(INK).text("Reporte de Inventario", x, titleY, { lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text("Análisis completo del inventario", x, titleY + 24, { lineBreak: false });

    const ruleY = titleY + 40;
    hairline(doc, ruleY);
    return ruleY + 20;
}

// ─── Título de sección ─────────────────────────────────────────────────────
function sectionHeading(doc: Doc, text: string, y: number, sub?: string): number {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(text, MARGIN, y, { lineBreak: false });
    let yy = y + 17;
    if (sub) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(sub, MARGIN, yy, { lineBreak: false });
        yy += 12;
    }
    hairline(doc, yy);
    return yy + 12;
}

// ─── KPIs: fila plana, sin tarjetas ─────────────────────────────────────────
interface Kpi {
    label: string;
    value: string;
}
function drawKpis(doc: Doc, cards: Kpi[], y: number): number {
    const colW = CONTENT_W / cards.length;
    cards.forEach((c, i) => {
        const cx = MARGIN + i * colW;
        const w = colW - 12;
        doc.font("Helvetica").fontSize(7).fillColor(MUTED);
        doc.text(fitText(doc, c.label.toUpperCase(), w), cx, y, { width: w, characterSpacing: 0.4, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(16).fillColor(INK);
        doc.text(fitText(doc, c.value, w), cx, y + 12, { width: w, lineBreak: false });
    });
    return y + 34;
}

// ─── Celda ───────────────────────────────────────────────────────────────────
function drawCell(doc: Doc, c: Cell, x: number, y: number, w: number, rowH: number, defaultAlign: "left" | "right") {
    const align = c.align ?? defaultAlign;
    const innerX = x + 8;
    const innerW = w - 16;
    const hasSub = !!c.sub;
    const mainY = hasSub ? y + 5 : y + (rowH - 9) / 2;

    doc.font(c.bold ? "Helvetica-Bold" : c.mono ? "Courier" : "Helvetica").fontSize(9).fillColor(c.color ?? BODY);
    doc.text(fitText(doc, c.text, innerW), innerX, mainY, { width: innerW, align, lineBreak: false });
    if (hasSub) {
        doc.font("Courier").fontSize(7).fillColor(MUTED);
        doc.text(fitText(doc, c.sub as string, innerW), innerX, mainY + 10.5, { width: innerW, align, lineBreak: false });
    }
}

// ─── Tabla: encabezado subrayado, sin relleno ni cebra ──────────────────────
function drawTable(doc: Doc, columns: Column[], rows: Row[], y: number, rowH: number): number {
    const x = MARGIN;
    const totalW = columns.reduce((s, c) => s + c.width, 0);

    const drawTableHeader = (yy: number): number => {
        let cx = x;
        for (const col of columns) {
            const cw = col.width - 16;
            doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED);
            doc.text(fitText(doc, col.header.toUpperCase(), cw), cx + 8, yy + 2, {
                width: cw,
                align: col.align ?? "left",
                characterSpacing: 0.3,
                lineBreak: false,
            });
            cx += col.width;
        }
        const ry = yy + 15;
        doc.moveTo(x, ry).lineTo(x + totalW, ry).lineWidth(0.75).strokeColor(LINE).stroke();
        return ry + 6;
    };

    y = drawTableHeader(y);

    rows.forEach((row) => {
        if (y + rowH > bottom(doc)) {
            doc.addPage();
            y = MARGIN;
            y = drawTableHeader(y);
        }
        if (row.topRule) {
            doc.moveTo(x, y).lineTo(x + totalW, y).lineWidth(0.75).strokeColor(LINE).stroke();
            y += 6;
        }
        let cx = x;
        for (let ci = 0; ci < columns.length; ci++) {
            drawCell(doc, cell(row.cells[ci] ?? ""), cx, y, columns[ci].width, rowH, columns[ci].align ?? "left");
            cx += columns[ci].width;
        }
        y += rowH;
    });

    return y;
}

// ─── Pie con numeración ─────────────────────────────────────────────────────
function drawFooters(doc: Doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // El pie va en la zona de margen inferior; sin esto pdfkit añade una
        // página en blanco por cada pie al creer que el texto no cabe.
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const fy = doc.page.height - 32;
        hairline(doc, fy - 7);
        doc.font("Helvetica").fontSize(8).fillColor(FAINT)
            .text("Stockly · Reporte de Inventario", MARGIN, fy, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(FAINT)
            .text(`Página ${i - range.start + 1} de ${range.count}`, MARGIN, fy, { width: CONTENT_W, align: "right", lineBreak: false });

        doc.page.margins.bottom = savedBottom;
    }
}

// ─── Punto de entrada ───────────────────────────────────────────────────────
export function renderReportPdf(doc: Doc, summary: ReportSummary, generatedAt: string) {
    let y = drawHeader(doc, generatedAt);

    // Resumen general
    y = sectionHeading(doc, "Resumen general", y);
    y = drawKpis(
        doc,
        [
            { label: "Total productos", value: int(summary.totals.totalProducts) },
            { label: "Productos activos", value: int(summary.totals.activeProducts) },
            { label: "Bajo stock", value: int(summary.totals.lowStockCount) },
            { label: "Valor inventario", value: moneyShort(summary.totals.inventoryValue) },
        ],
        y,
    );
    y += 20;

    // Stock por categoría
    if (summary.stockByCategory.length > 0) {
        y = ensureSpace(doc, y, 90);
        y = sectionHeading(doc, "Stock por categoría", y);
        const cats = [...summary.stockByCategory].sort((a, b) => Number(b.value) - Number(a.value));
        const totalVal = cats.reduce((s, c) => s + Number(c.value), 0);
        const totalUnits = cats.reduce((s, c) => s + c.stock, 0);
        const rows: Row[] = cats.map((c) => ({
            cells: [
                c.name,
                { text: int(c.stock), align: "right", color: MUTED },
                { text: money(Number(c.value)), align: "right", color: INK },
                { text: totalVal > 0 ? `${((Number(c.value) / totalVal) * 100).toFixed(1)}%` : "—", align: "right", color: MUTED },
            ],
        }));
        rows.push({
            topRule: true,
            cells: [
                { text: "Total", bold: true, color: INK },
                { text: int(totalUnits), align: "right", bold: true, color: INK },
                { text: money(totalVal), align: "right", bold: true, color: INK },
                { text: "100.0%", align: "right", bold: true, color: MUTED },
            ],
        });
        y = drawTable(
            doc,
            [
                { header: "Categoría", width: 205 },
                { header: "Unidades", width: 90, align: "right" },
                { header: "Valor", width: 115, align: "right" },
                { header: "% del valor", width: 105, align: "right" },
            ],
            rows,
            y,
            22,
        );
        y += 22;
    }

    // Top 10 productos por valor
    if (summary.topByValue.length > 0) {
        y = ensureSpace(doc, y, 90);
        y = sectionHeading(doc, "Top 10 productos por valor", y);
        const rows: Row[] = summary.topByValue.map((p, i) => ({
            cells: [
                { text: String(i + 1), color: MUTED },
                { text: p.name, color: INK },
                { text: p.sku ?? "—", mono: true, color: MUTED },
                { text: money(p.price), align: "right", color: MUTED },
                { text: int(p.stock), align: "right" },
                { text: money(p.totalValue), align: "right", bold: true, color: INK },
            ],
        }));
        y = drawTable(
            doc,
            [
                { header: "#", width: 24 },
                { header: "Producto", width: 172 },
                { header: "SKU", width: 92 },
                { header: "Precio", width: 70, align: "right" },
                { header: "Stock", width: 47, align: "right" },
                { header: "Valor total", width: 110, align: "right" },
            ],
            rows,
            y,
            22,
        );
        y += 22;
    }

    // Alertas de bajo stock
    if (summary.lowStockProducts.length > 0) {
        y = ensureSpace(doc, y, 90);
        y = sectionHeading(doc, `Alertas de bajo stock (${summary.lowStockProducts.length})`, y);
        const rows: Row[] = summary.lowStockProducts.map((p) => {
            const agotado = p.stock === 0;
            return {
                cells: [
                    { text: p.name, color: INK },
                    { text: p.sku ?? "—", mono: true, color: MUTED },
                    { text: p.category ?? "—", color: MUTED },
                    { text: int(p.stock), align: "right", bold: true, color: agotado ? CRIT : INK },
                    { text: int(p.minStock), align: "right", color: MUTED },
                    { text: agotado ? "Agotado" : "Bajo", color: agotado ? CRIT : MUTED, bold: agotado },
                ],
            };
        });
        y = drawTable(
            doc,
            [
                { header: "Producto", width: 165 },
                { header: "SKU", width: 92 },
                { header: "Categoría", width: 88 },
                { header: "Stock", width: 52, align: "right" },
                { header: "Mínimo", width: 52, align: "right" },
                { header: "Estado", width: 66 },
            ],
            rows,
            y,
            22,
        );
        y += 22;
    }

    // Rotación de stock
    const withMovements = summary.stockMetrics.filter((m) => m.totalOutLast30Days > 0);
    if (withMovements.length > 0) {
        y = ensureSpace(doc, y, 96);
        y = sectionHeading(doc, "Rotación de stock — últimos 30 días", y, "Solo productos con movimientos de salida");
        const rows: Row[] = withMovements.map((m) => {
            const urgent = m.daysToStockout !== null && m.daysToStockout <= 7;
            const dias = m.daysToStockout !== null ? `${m.daysToStockout} días` : "—";
            return {
                cells: [
                    { text: m.productName, sub: m.sku ?? undefined, color: INK },
                    { text: int(m.totalOutLast30Days), align: "right", color: MUTED },
                    { text: `${m.dailyVelocity.toFixed(2)}/día`, align: "right", color: MUTED },
                    { text: int(m.currentStock), align: "right", color: INK },
                    { text: dias, align: "right", color: urgent ? CRIT : BODY, bold: m.daysToStockout !== null && m.daysToStockout <= 14 },
                ],
            };
        });
        y = drawTable(
            doc,
            [
                { header: "Producto", width: 190 },
                { header: "Salidas 30d", width: 80, align: "right" },
                { header: "Vel./día", width: 75, align: "right" },
                { header: "Stock", width: 65, align: "right" },
                { header: "Días rest.", width: 105, align: "right" },
            ],
            rows,
            y,
            30,
        );
    }

    drawFooters(doc);
}
