import { Request, Response, NextFunction } from "express";
import PDFDocument from "pdfkit";
import { reportsService } from "./reports.service";

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const summary = await reportsService.getSummary();
        const format = (req.query.format as string | undefined) ?? "json";

        if (format === "pdf") {
            const doc = new PDFDocument({ margin: 40, size: "A4" });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "attachment; filename=reporte-stockly.pdf");
            doc.pipe(res);

            const generatedAt = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });

            // Encabezado
            doc.fontSize(20).font("Helvetica-Bold").text("Reporte de Inventario — Stockly", { align: "center" });
            doc.fontSize(10).font("Helvetica").fillColor("#888").text(`Generado el ${generatedAt}`, { align: "center" });
            doc.moveDown(1.5);

            // KPIs
            doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text("Resumen general");
            doc.moveDown(0.5);
            const kpis = [
                ["Total productos", summary.totals.totalProducts],
                ["Productos activos", summary.totals.activeProducts],
                ["Productos inactivos", summary.totals.inactiveProducts],
                ["Valor total del inventario", `$${summary.totals.inventoryValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`],
            ];
            for (const [label, value] of kpis) {
                doc.fontSize(11).font("Helvetica-Bold").text(`${label}: `, { continued: true });
                doc.font("Helvetica").text(String(value));
            }
            doc.moveDown(1);

            // Stock por categoría
            doc.fontSize(14).font("Helvetica-Bold").text("Stock por categoría");
            doc.moveDown(0.5);
            for (const cat of summary.stockByCategory) {
                doc.fontSize(10).font("Helvetica").text(`${cat.name}: ${cat.stock} uds — $${Number(cat.value).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
            }
            doc.moveDown(1);

            // Top 10 productos
            doc.fontSize(14).font("Helvetica-Bold").text("Top 10 productos por valor");
            doc.moveDown(0.5);
            summary.topByValue.forEach((p, i) => {
                doc.fontSize(10).font("Helvetica").text(
                    `${i + 1}. ${p.name} (SKU: ${p.sku ?? "-"}) — Stock: ${p.stock} — Valor: $${p.totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
                );
            });
            doc.moveDown(1);

            // Alertas de bajo stock
            if (summary.lowStockProducts.length > 0) {
                doc.fontSize(14).font("Helvetica-Bold").fillColor("#c53030").text("Alertas de bajo stock");
                doc.fillColor("#000").moveDown(0.5);
                for (const p of summary.lowStockProducts) {
                    doc.fontSize(10).font("Helvetica").text(
                        `${p.name} (${p.sku ?? "-"}) — Stock: ${p.stock} / Mínimo: ${p.minStock}`,
                    );
                }
                doc.moveDown(1);
            }

            // Métricas de rotación (solo productos con movimientos)
            const withMovements = summary.stockMetrics.filter((m) => m.totalOutLast30Days > 0);
            if (withMovements.length > 0) {
                doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text("Métricas de rotación (últimos 30 días)");
                doc.moveDown(0.5);
                for (const m of withMovements) {
                    const dias = m.daysToStockout !== null ? `${m.daysToStockout} días` : "—";
                    doc.fontSize(10).font("Helvetica").text(
                        `${m.productName} — Salidas: ${m.totalOutLast30Days} — Vel: ${m.dailyVelocity}/día — Desabastecimiento en: ${dias}${m.reorderSoon ? " ⚠️" : ""}`,
                    );
                }
            }

            doc.end();
            return;
        }

        res.json({ success: true, message: "Reporte generado exitosamente", data: summary });
    } catch (error) {
        next(error);
    }
}
