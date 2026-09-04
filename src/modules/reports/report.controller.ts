import type { Request, Response } from "express";

import { buildCsv, buildExcelXml, buildPdf } from "./report.export.js";
import { buildExportTable, getReport, listReportStores } from "./report.service.js";
import { reportExportQuerySchema, reportQuerySchema, reportTypeSchema } from "./report.validation.js";

export async function reportData(req: Request, res: Response): Promise<void> {
  const report = reportTypeSchema.parse(req.params.report);
  const query = reportQuerySchema.parse(req.query);
  const data = await getReport(report, query);
  res.status(200).json({ success: true, data });
}

export async function reportStores(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: { stores: await listReportStores() } });
}

export async function exportReport(req: Request, res: Response): Promise<void> {
  const query = reportExportQuerySchema.parse(req.query);
  const table = await buildExportTable(query.report, query);
  const dateSuffix = `${query.from ?? "recent"}-${query.to ?? "today"}`;
  if (query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${query.report}-${dateSuffix}.csv"`);
    res.status(200).send(buildCsv(table));
    return;
  }
  if (query.format === "excel") {
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${query.report}-${dateSuffix}.xls"`);
    res.status(200).send(buildExcelXml(table));
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${query.report}-${dateSuffix}.pdf"`);
  res.status(200).send(buildPdf(table));
}
