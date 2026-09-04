import { Types } from "mongoose";
import { z } from "zod";

export const REPORT_TYPES = [
  "overview",
  "sales",
  "profitability",
  "inventory",
  "waste-expiry",
  "customers",
  "suppliers",
  "payments",
  "fulfillment",
] as const;

export const REPORT_EXPORT_FORMATS = ["csv", "excel", "pdf"] as const;
export const reportTypeSchema = z.enum(REPORT_TYPES);

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const objectId = z.string().refine((value) => Types.ObjectId.isValid(value), "Invalid store id.");

export const reportQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    storeId: objectId.optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.from || !value.to) return;
    const from = new Date(`${value.from}T00:00:00.000Z`);
    const to = new Date(`${value.to}T00:00:00.000Z`);
    if (from.getTime() > to.getTime()) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "The end date must be on or after the start date." });
      return;
    }
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > 366) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Report ranges cannot exceed 366 days." });
    }
  });

export const reportExportQuerySchema = reportQuerySchema.and(
  z.object({
    report: reportTypeSchema,
    format: z.enum(REPORT_EXPORT_FORMATS),
  }),
);

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type ReportExportQueryInput = z.infer<typeof reportExportQuerySchema>;
