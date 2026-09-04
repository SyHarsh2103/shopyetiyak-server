import { z } from "zod";

import { objectIdSchema } from "../../utils/object-id.js";

const positiveQuantity = z.number().finite().positive().max(1_000_000);

export const pickingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  storeId: objectIdSchema.optional(),
  search: z.string().trim().max(120).default(""),
}).strict();

export const fulfillmentOrderParamSchema = z.object({
  orderId: objectIdSchema,
}).strict();

export const fulfillmentItemParamSchema = z.object({
  orderId: objectIdSchema,
  orderItemId: objectIdSchema,
}).strict();

export const markPickedSchema = z.object({
  pickedQuantity: positiveQuantity.optional(),
  actualWeight: positiveQuantity.optional(),
  batchId: objectIdSchema.nullable().optional().default(null),
}).strict();

export const markUnavailableSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();

export const substituteItemSchema = z.object({
  replacementProductId: objectIdSchema,
  replacementVariantId: objectIdSchema,
  replacementQuantity: positiveQuantity,
  batchId: objectIdSchema.nullable().optional().default(null),
  customerApproved: z.boolean().optional().default(false),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const substitutionCandidateQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const completePickingSchema = z.object({
  note: z.string().trim().max(1000).optional().default(""),
}).strict();
