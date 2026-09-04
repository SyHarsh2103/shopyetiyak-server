import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
const dateOrNull = z.coerce.date().nullable().optional();
export const marketingIdParamSchema = z.object({ id: objectId });

const couponFields = z.object({
  code: z.string().trim().min(2).max(40).toUpperCase(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  percentageBasisPoints: z.number().int().min(1).max(10000).nullable().optional(),
  fixedAmountMinor: z.number().int().positive().nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  minimumSubtotalMinor: z.number().int().min(0).default(0),
  maximumDiscountMinor: z.number().int().positive().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  customerUsageLimit: z.number().int().positive().nullable().optional(),
  storeIds: z.array(objectId).default([]),
  productIds: z.array(objectId).default([]),
  categoryIds: z.array(objectId).default([]),
  brandIds: z.array(objectId).default([]),
  collectionIds: z.array(objectId).default([]),
  stackableWithPromotions: z.boolean().default(true),
  startsAt: dateOrNull,
  endsAt: dateOrNull,
  isActive: z.boolean().default(true),
});
export const couponInputSchema = couponFields.superRefine((value, ctx) => {
  if (value.discountType === "PERCENTAGE" && !value.percentageBasisPoints) ctx.addIssue({ code: "custom", path: ["percentageBasisPoints"], message: "Percentage is required." });
  if (value.discountType === "FIXED" && !value.fixedAmountMinor) ctx.addIssue({ code: "custom", path: ["fixedAmountMinor"], message: "Fixed amount is required." });
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be after start date." });
});
export const couponUpdateSchema = couponFields.partial().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });
