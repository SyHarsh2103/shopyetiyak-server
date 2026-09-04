import { z } from "zod";

import { PAYMENT_STATUSES } from "../payments/payment.model.js";
import { ORDER_STATUSES } from "./order.model.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
const orderNumber = z.string().trim().regex(/^GR-[A-Z0-9-]{8,40}$/i, "Invalid order number.");
const idempotencyKey = z.string().trim().min(16).max(120);

export const orderIdParamSchema = z.object({ orderId: objectId });
export const orderNumberParamSchema = z.object({ orderNumber });

export const adminOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).default(""),
  storeId: objectId.optional(),
  orderStatus: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const customerOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminOrderStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "PROCESSING"]),
  note: z.string().trim().max(1000).default(""),
});

export const orderCancelSchema = z.object({
  idempotencyKey,
  reason: z.string().trim().min(1).max(500),
  refundCaptured: z.boolean().default(false),
});

export const orderRefundSchema = z.object({
  idempotencyKey,
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(500),
});
