import { z } from "zod";

import { objectIdSchema } from "../../utils/object-id.js";
import { DELIVERY_SLOT_STATUSES } from "./delivery-slot.model.js";
import { DELIVERY_ZONE_STATUSES } from "./delivery-zone.model.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm format.");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.");

const deliveryZoneFields = z.object({
  storeId: objectIdSchema,
  name: z.string().trim().min(2).max(160),
  postalCodes: z.array(z.string().trim().min(1).max(32)).max(500).default([]),
  minimumOrderMinor: z.number().int().min(0).default(0),
  deliveryFeeMinor: z.number().int().min(0).default(0),
  freeDeliveryThresholdMinor: z.number().int().min(0).nullable().default(null),
  radiusKm: z.number().positive().max(500).nullable().default(null),
  centerLatitude: z.number().min(-90).max(90).nullable().default(null),
  centerLongitude: z.number().min(-180).max(180).nullable().default(null),
  availableDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  status: z.enum(DELIVERY_ZONE_STATUSES).default("ACTIVE"),
}).strict();

function validateRadius(
  value: { radiusKm?: number | null; centerLatitude?: number | null; centerLongitude?: number | null },
  context: z.RefinementCtx,
): void {
  if (value.radiusKm !== null && value.radiusKm !== undefined && (value.centerLatitude === null || value.centerLatitude === undefined || value.centerLongitude === null || value.centerLongitude === undefined)) {
    context.addIssue({ code: "custom", path: ["radiusKm"], message: "Radius configuration requires center latitude and longitude." });
  }
}

export const deliveryZoneInputSchema = deliveryZoneFields.superRefine(validateRadius);
export const deliveryZoneUpdateSchema = deliveryZoneFields.omit({ storeId: true }).partial().superRefine(validateRadius);

export const deliveryZoneListQuerySchema = z.object({
  storeId: objectIdSchema.optional(),
  status: z.enum(DELIVERY_ZONE_STATUSES).optional(),
}).strict();

export const deliveryEligibilityQuerySchema = z.object({
  storeId: objectIdSchema,
  postalCode: z.string().trim().min(1).max(32),
}).strict();

const deliverySlotFields = z.object({
  storeId: objectIdSchema,
  zoneId: objectIdSchema.nullable().default(null),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  capacity: z.number().int().min(1).max(10000),
  cutoffMinutes: z.number().int().min(0).max(10080).default(120),
  status: z.enum(DELIVERY_SLOT_STATUSES).default("ACTIVE"),
}).strict();

function validateTimeRange(
  value: { startTime?: string; endTime?: string },
  context: z.RefinementCtx,
): void {
  if (value.startTime && value.endTime && value.startTime >= value.endTime) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "End time must be later than start time." });
  }
}

export const deliverySlotInputSchema = deliverySlotFields.superRefine(validateTimeRange);
export const deliverySlotUpdateSchema = deliverySlotFields.omit({ storeId: true }).partial().superRefine(validateTimeRange);

export const deliverySlotListQuerySchema = z.object({
  storeId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  date: dateSchema.optional(),
  status: z.enum(DELIVERY_SLOT_STATUSES).optional(),
}).strict();

export const publicDeliverySlotQuerySchema = z.object({
  storeId: objectIdSchema,
  postalCode: z.string().trim().min(1).max(32),
  date: dateSchema.optional(),
}).strict();

export const deliveryIdParamSchema = z.object({ id: objectIdSchema });
export const deliveryOrderParamSchema = z.object({ orderId: objectIdSchema });
export const deliveryOrderNoteSchema = z.object({ note: z.string().trim().max(500).default("") }).strict();
