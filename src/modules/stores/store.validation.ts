import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { STORE_STATUSES } from "./store-location.model.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm format.");

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(180),
  line2: z.string().trim().max(180).optional().default(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(1).max(120),
}).strict();

const businessHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isClosed: z.boolean().optional().default(false),
  opensAt: timeSchema.optional().default("09:00"),
  closesAt: timeSchema.optional().default("18:00"),
}).strict().superRefine((value, context) => {
  if (!value.isClosed && value.opensAt >= value.closesAt) {
    context.addIssue({
      code: "custom",
      path: ["closesAt"],
      message: "Closing time must be later than opening time.",
    });
  }
});

const storeFields = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  address: addressSchema,
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional().default(""),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
  timezone: z.string().trim().min(1).max(80).optional().default("America/New_York"),
  businessHours: z.array(businessHourSchema).max(7).optional().default([]),
  pickupEnabled: z.boolean().optional().default(true),
  deliveryEnabled: z.boolean().optional().default(true),
  status: z.enum(STORE_STATUSES).optional().default("ACTIVE"),
}).strict();

function validateBusinessHours(
  businessHours: Array<{ dayOfWeek: number }> | undefined,
  context: z.RefinementCtx,
): void {
  if (!businessHours) return;
  const days = new Set<number>();
  businessHours.forEach((entry, index) => {
    if (days.has(entry.dayOfWeek)) {
      context.addIssue({ code: "custom", path: ["businessHours", index, "dayOfWeek"], message: "A business-hours day may only appear once." });
    }
    days.add(entry.dayOfWeek);
  });
}

export const createStoreSchema = storeFields.superRefine((value, context) => {
  validateBusinessHours(value.businessHours, context);
});

export const updateStoreSchema = storeFields
  .partial()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: "custom", path: [], message: "At least one store field must be provided." });
    }
    validateBusinessHours(value.businessHours, context);
  });

export const storeListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(STORE_STATUSES).optional(),
}).strict();

export const upsertStoreProductSchema = z.object({
  storeId: objectIdSchema,
  productId: objectIdSchema,
  isAvailable: z.boolean(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
}).strict();

export const storeProductListQuerySchema = z.object({
  storeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  available: z.enum(["true", "false"]).optional(),
}).strict();
