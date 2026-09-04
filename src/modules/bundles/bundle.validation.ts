import { z } from "zod";
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
const bundleFields = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).default(""),
  bundleType: z.enum(["STANDARD", "MEAL_KIT"]).default("STANDARD"),
  components: z.array(z.object({ productId: objectId, variantId: objectId, quantity: z.number().positive() })).min(1),
  pricingMode: z.enum(["SUM_COMPONENTS", "FIXED"]).default("SUM_COMPONENTS"),
  fixedPriceMinor: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  isFeatured: z.boolean().default(false),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});
export const bundleInputSchema = bundleFields.superRefine((value, ctx) => {
  if (value.pricingMode === "FIXED" && value.fixedPriceMinor == null) ctx.addIssue({ code: "custom", path: ["fixedPriceMinor"], message: "Fixed price is required." });
});
export const bundleUpdateSchema = bundleFields.partial().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });
export const bundleIdParamSchema = z.object({ id: objectId });
