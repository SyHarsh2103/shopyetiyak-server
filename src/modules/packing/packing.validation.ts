import { z } from "zod";

export const completePackingSchema = z.object({
  bagCount: z.number().int().min(0).max(500),
  notes: z.string().trim().max(1000).optional().default(""),
}).strict();
