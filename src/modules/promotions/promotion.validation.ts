import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
const nullableMoney = z.number().int().positive().nullable().optional();

const promotionFields = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1500).default(""),
  type: z.enum(["PERCENTAGE", "FIXED", "FREE_DELIVERY"]),
  scope: z.enum(["CART", "PRODUCT", "CATEGORY", "BRAND", "COLLECTION"]).default("CART"),
  percentageBasisPoints: z.number().int().min(1).max(10000).nullable().optional(),
  fixedAmountMinor: nullableMoney,
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  minimumSubtotalMinor: z.number().int().min(0).default(0),
  maximumDiscountMinor: nullableMoney,
  storeIds: z.array(objectId).default([]),
  productIds: z.array(objectId).default([]),
  categoryIds: z.array(objectId).default([]),
  brandIds: z.array(objectId).default([]),
  collectionIds: z.array(objectId).default([]),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  priority: z.number().int().min(0).max(100000).default(100),
  stackableWithCoupons: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

function validatePromotion(value: z.infer<typeof promotionFields>, ctx: z.RefinementCtx): void {
  if (value.type === "PERCENTAGE" && !value.percentageBasisPoints) {
    ctx.addIssue({ code: "custom", path: ["percentageBasisPoints"], message: "Percentage is required." });
  }
  if (value.type === "FIXED" && !value.fixedAmountMinor) {
    ctx.addIssue({ code: "custom", path: ["fixedAmountMinor"], message: "Fixed discount is required." });
  }
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be after start date." });
  }
}

export const promotionInputSchema = promotionFields.superRefine(validatePromotion);
export const promotionUpdateSchema = promotionFields.partial().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });
export const promotionIdParamSchema = z.object({ id: objectId });
