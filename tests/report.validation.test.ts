import { describe, expect, it } from "vitest";
import { reportExportQuerySchema, reportQuerySchema } from "../src/modules/reports/report.validation.js";

describe("Phase 16 report validation", () => {
  it("accepts a valid bounded range", () => {
    expect(reportQuerySchema.parse({ from: "2026-01-01", to: "2026-01-31", currency: "usd" }).currency).toBe("USD");
  });

  it("rejects ranges over 366 days", () => {
    expect(() => reportQuerySchema.parse({ from: "2024-01-01", to: "2026-01-01" })).toThrow();
  });

  it("accepts all supported export formats", () => {
    for (const format of ["csv", "excel", "pdf"] as const) {
      expect(reportExportQuerySchema.parse({ report: "sales", format }).format).toBe(format);
    }
  });
});
