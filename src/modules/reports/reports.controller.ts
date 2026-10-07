import { Request, Response, NextFunction } from "express";
import PDFDocument from "pdfkit";
import { reportsService } from "./reports.service";
import { abcService } from "./reports.abc";
import { renderPeriodReportPdf, renderReportPdf } from "./reports.pdf";
import { enviarExportacion } from "@/shared/lib/exportacion";
import { settingsService } from "@/modules/settings/settings.service";

export const reportsController = {
    async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const summary = await reportsService.getSummary();
            const format = (req.query.format as string | undefined) ?? "json";

            if (format === "pdf") {
                const generatedAt = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
                // Antes de escribir la cabecera: un error después de empezar el PDF ya no
                // puede ser una respuesta JSON.
                const moneda = await settingsService.moneda();

                const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", "attachment; filename=reporte-stockly.pdf");
                doc.pipe(res);

                renderReportPdf(doc, summary, generatedAt, moneda);

                doc.end();
                return;
            }

            res.json({ success: true, message: "Reporte generado exitosamente", data: summary });
        } catch (error) {
            next(error);
        }
    },

    /**
     * T5-09 — ventas y compras de un periodo. `format=csv` exporta el desglose por producto
     * completo; `format=pdf`, el informe como se ve en pantalla.
     */
    async getPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const format = (req.query.format as string | undefined) ?? "json";

            if (format === "csv") {
                const { periodo, filas } = await reportsService.getPeriodProducts(req.query);
                await enviarExportacion(res, {
                    formato: "csv",
                    nombreArchivo: `informe-${periodo.from}-${periodo.to}`,
                    mensaje: "Informe por periodo exportado",
                    total: filas.length,
                    lotes: (async function* () {
                        yield filas.map((f) => ({
                            productName: f.name,
                            productSku: f.sku ?? "",
                            category: f.category ?? "",
                            salesUnits: f.salesUnits,
                            salesRevenue: f.salesRevenue,
                            purchaseUnits: f.purchaseUnits,
                            purchaseAmount: f.purchaseAmount,
                        }));
                    })(),
                });
                return;
            }

            const informe = await reportsService.getPeriod(req.query);

            if (format === "pdf") {
                const generatedAt = new Date().toLocaleString("es-MX", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: informe.timezone,
                });
                const moneda = await settingsService.moneda();

                const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `attachment; filename=informe-${informe.from}-${informe.to}.pdf`);
                doc.pipe(res);

                renderPeriodReportPdf(doc, informe, generatedAt, moneda);

                doc.end();
                return;
            }

            res.json({ success: true, message: "Informe por periodo generado", data: informe });
        } catch (error) {
            next(error);
        }
    },

    /** T5-10 — el periodo de la clasificación ABC y cuántos productos hay en cada clase. */
    async getAbc(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const resumen = await abcService.resumen();
            res.json({ success: true, message: "Clasificación ABC obtenida", data: resumen });
        } catch (error) {
            next(error);
        }
    },
};
