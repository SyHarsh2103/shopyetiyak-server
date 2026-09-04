import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const valueRedemptionInputSchema = z.object({
  loyaltyPoints: z.number().int().min(0).max(1_000_000).default(0),
  storeCreditMinor: z.number().int().min(0).max(100_000_000).default(0),
  giftCardCode: z.string().trim().min(8).max(120).optional(),
  giftCardMinor: z.number().int().min(0).max(100_000_000).default(0),
}).strict().default({
  loyaltyPoints: 0,
  storeCreditMinor: 0,
  giftCardMinor: 0,
});

export const customerValueHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const adminCustomerValueListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminLoyaltyAdjustmentSchema = z.object({
  customerId: objectId,
  pointsDelta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, "Adjustment cannot be zero."),
  note: z.string().trim().min(1).max(500),
});

export const adminStoreCreditAdjustmentSchema = z.object({
  customerId: objectId,
  currency,
  amountDeltaMinor: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0, "Adjustment cannot be zero."),
  note: z.string().trim().min(1).max(500),
});

export const adminGiftCardCreateSchema = z.object({
  currency,
  initialBalanceMinor: z.number().int().min(100).max(100_000_000),
  expiresAt: z.string().datetime().nullable().default(null),
  recipientEmail: z.string().trim().email().max(254).or(z.literal("")).default(""),
  note: z.string().trim().max(500).default(""),
});

export const adminGiftCardAdjustmentSchema = z.object({
  amountDeltaMinor: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0, "Adjustment cannot be zero."),
  note: z.string().trim().min(1).max(500),
});

export const adminGiftCardStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export const giftCardIdParamSchema = z.object({ giftCardId: objectId });

export const backInStockSubscribeSchema = z.object({
  storeId: objectId,
  productId: objectId,
  variantId: objectId,
  email: z.string().trim().email().max(254).optional(),
}).strict();

export const backInStockCancelSchema = z.object({
  subscriptionId: objectId,
  token: z.string().trim().min(16).max(200),
}).strict();

export const backInStockAdminQuerySchema = z.object({
  status: z.enum(["ACTIVE", "NOTIFIED", "CANCELLED"]).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
