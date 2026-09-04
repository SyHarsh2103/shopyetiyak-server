import { z } from "zod";
import { SELLING_UNITS } from "../products/product.model.js";

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

export const publicCatalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  q: z.string().trim().max(120).optional(),
  storeId: z.string().trim().min(1).max(80).optional(),
  category: z.string().trim().min(1).max(140).optional(),
  collection: z.string().trim().min(1).max(140).optional(),
  brand: z.string().trim().min(1).max(140).optional(),
  minPriceMinor: z.coerce.number().int().min(0).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).optional(),
  inStock: booleanQuery.optional(),
  vegetarian: booleanQuery.optional(),
  vegan: booleanQuery.optional(),
  glutenFree: booleanQuery.optional(),
  halal: booleanQuery.optional(),
  organic: booleanQuery.optional(),
  country: z.string().trim().max(120).optional(),
  discount: booleanQuery.optional(),
  unit: z.enum(SELLING_UNITS).optional(),
  size: z.string().trim().max(80).optional(),
  sort: z.enum(["recommended", "newest", "best_selling", "price_asc", "price_desc", "discount"]).default("recommended"),
}).superRefine((value, context) => {
  if (
    value.minPriceMinor !== undefined &&
    value.maxPriceMinor !== undefined &&
    value.minPriceMinor > value.maxPriceMinor
  ) {
    context.addIssue({
      code: "custom",
      path: ["maxPriceMinor"],
      message: "Maximum price must be greater than or equal to minimum price.",
    });
  }
});

export const publicCatalogSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export const publicSearchSuggestionQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  storeId: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

export const publicHomeQuerySchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
});
