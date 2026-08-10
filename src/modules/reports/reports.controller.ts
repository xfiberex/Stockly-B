import { Request, Response, NextFunction } from "express";
import PDFDocument from "pdfkit";
import { reportsService } from "./reports.service";
import { renderReportPdf } from "./reports.pdf";

export const reportsController = {
    async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const summary = await reportsService.getSummary();
            const format = (req.query.format as string | undefined) ?? "json";

            if (format === "pdf") {
                const generatedAt = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });

                const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", "attachment; filename=reporte-stockly.pdf");
                doc.pipe(res);

                renderReportPdf(doc, summary, generatedAt);

                doc.end();
                return;
            }

            res.json({ success: true, message: "Reporte generado exitosamente", data: summary });
        } catch (error) {
            next(error);
        }
    },
};
