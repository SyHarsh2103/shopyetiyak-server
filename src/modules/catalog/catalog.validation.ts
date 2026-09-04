import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";

export const seoSchema = z.object({
  title: z.string().trim().max(70).optional().default(""),
  description: z.string().trim().max(180).optional().default(""),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).optional().default([]),
}).strict();

export const idParamSchema = z.object({ id: objectIdSchema }).strict();

export const catalogListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: z.enum(["true", "false"]).optional(),
}).strict();

export const paginatedCatalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  active: z.enum(["true", "false"]).optional(),
}).strict();
