import { z } from "zod";

import { valueRedemptionInputSchema } from "../customer-value/customer-value.validation.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(3).max(40),
  line1: z.string().trim().min(1).max(180),
  line2: z.string().trim().max(180).default(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(1).max(120),
  deliveryInstructions: z.string().trim().max(500).default(""),
});


const substitutionPreferenceSchema = z.object({
  productId: objectId,
  variantId: objectId,
  preference: z.enum([
    "BEST_AVAILABLE",
    "SAME_OR_LOWER",
    "CONTACT_FIRST",
    "DO_NOT_SUBSTITUTE",
  ]),
}).strict();

const guestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(3).max(40),
});

export const checkoutReviewSchema = z.object({
  storeId: objectId,
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  deliverySlotId: objectId.optional(),
  pickupSlotId: objectId.optional(),
  addressId: objectId.optional(),
  deliveryAddress: addressSchema.optional(),
  guest: guestSchema.optional(),
  customerNotes: z.string().trim().max(1000).default(""),
  substitutionPreferences: z.array(substitutionPreferenceSchema).max(200).optional(),
  valueRedemptions: valueRedemptionInputSchema.optional(),
});
