import { z } from "zod";
import { seoSchema } from "../catalog/catalog.validation.js";

const collectionFields = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1500).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0),
  merchandisingType: z.enum(["STANDARD", "WEEKLY_DEAL", "FESTIVAL", "BEST_SELLERS", "NEW_ARRIVALS"]).optional().default("STANDARD"),
  startsAt: z.coerce.date().nullable().optional().default(null),
  endsAt: z.coerce.date().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  seo: seoSchema.optional().default({ title: "", description: "", keywords: [] }),
}).strict();

export const createCollectionSchema = collectionFields;
export const updateCollectionSchema = collectionFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one collection field must be provided." },
);
