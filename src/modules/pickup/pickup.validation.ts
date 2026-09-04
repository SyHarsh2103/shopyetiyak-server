import { z } from "zod";

import { objectIdSchema } from "../../utils/object-id.js";
import { PICKUP_SLOT_STATUSES } from "./pickup-slot.model.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm format.");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.");

const pickupSlotFields = z.object({
  storeId: objectIdSchema,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  capacity: z.number().int().min(1).max(10000),
  cutoffMinutes: z.number().int().min(0).max(10080).default(60),
  status: z.enum(PICKUP_SLOT_STATUSES).default("ACTIVE"),
}).strict();

function validateTimeRange(
  value: { startTime?: string; endTime?: string },
  context: z.RefinementCtx,
): void {
  if (value.startTime && value.endTime && value.startTime >= value.endTime) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "End time must be later than start time." });
  }
}

export const pickupSlotInputSchema = pickupSlotFields.superRefine(validateTimeRange);
export const pickupSlotUpdateSchema = pickupSlotFields.omit({ storeId: true }).partial().superRefine(validateTimeRange);

export const pickupSlotListQuerySchema = z.object({
  storeId: objectIdSchema.optional(),
  date: dateSchema.optional(),
  status: z.enum(PICKUP_SLOT_STATUSES).optional(),
}).strict();

export const publicPickupSlotQuerySchema = z.object({
  storeId: objectIdSchema,
  date: dateSchema.optional(),
}).strict();

export const pickupIdParamSchema = z.object({ id: objectIdSchema });
export const pickupOrderParamSchema = z.object({ orderId: objectIdSchema });
export const pickupOrderNoteSchema = z.object({ note: z.string().trim().max(500).default("") }).strict();
