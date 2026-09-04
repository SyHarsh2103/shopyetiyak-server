import { z } from "zod";
import { seoSchema } from "../catalog/catalog.validation.js";

const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]);

const brandFields = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1000).optional().default(""),
  websiteUrl: optionalUrl.optional().default(""),
  countryOfOrigin: z.string().trim().max(120).optional().default(""),
  isActive: z.boolean().optional().default(true),
  seo: seoSchema.optional().default({ title: "", description: "", keywords: [] }),
}).strict();

export const createBrandSchema = brandFields;
export const updateBrandSchema = brandFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one brand field must be provided." },
);
