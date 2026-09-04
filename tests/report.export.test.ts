import { describe, expect, it } from "vitest";
import { buildCsv, buildExcelXml, buildPdf } from "../src/modules/reports/report.export.js";

const table = { title: "Phase 16", headers: ["Name", "Amount"], rows: [["Rice", 1250], ["Tea, Coffee", 500]] };

describe("Phase 16 report exports", () => {
  it("creates a quoted CSV", () => {
    const csv = buildCsv(table).toString("utf8");
    expect(csv).toContain('"Tea, Coffee"');
  });

  it("creates Excel-readable SpreadsheetML", () => {
    expect(buildExcelXml(table).toString("utf8")).toContain("<Workbook");
  });

  it("creates a PDF document", () => {
    expect(buildPdf(table).subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
  });
});
