import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { seoSchema } from "../catalog/catalog.validation.js";

const categoryFields = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1000).optional().default(""),
  parentId: objectIdSchema.nullable().optional().default(null),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0),
  isActive: z.boolean().optional().default(true),
  seo: seoSchema.optional().default({ title: "", description: "", keywords: [] }),
}).strict();

export const createCategorySchema = categoryFields;
export const updateCategorySchema = categoryFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one category field must be provided." },
);
