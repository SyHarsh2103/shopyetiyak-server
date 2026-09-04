import { z } from "zod";

import { checkoutReviewSchema } from "../checkout/checkout.validation.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
const idempotencyKey = z.string().trim().min(16).max(120);

export const createPaymentIntentSchema = checkoutReviewSchema.extend({
  idempotencyKey,
});

export const paymentIdParamSchema = z.object({
  paymentId: objectId,
});

export const paymentCaptureSchema = z.object({
  idempotencyKey,
  amountMinor: z.number().int().positive().optional(),
});

export const paymentCancelSchema = z.object({
  idempotencyKey,
});

export const paymentRefundSchema = z.object({
  idempotencyKey,
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).default(""),
});
