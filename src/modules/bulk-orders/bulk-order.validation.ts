import { z } from "zod";

import {
  BULK_REQUEST_STATUSES,
  BULK_REQUEST_TYPES,
} from "./bulk-order-request.model.js";
import {
  QUOTE_DEPOSIT_MODES,
  QUOTE_STATUSES,
} from "./quote.model.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
const money = z.number().int().min(0).max(1_000_000_000);
const dateString = z.string().trim().refine(
  (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  },
  "Invalid date.",
);

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(3).max(40),
}).strict();

export const bulkAddressSchema = z.object({
  recipientName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(3).max(40),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(30),
  country: z.string().trim().min(1).max(80),
}).strict();

export const createBulkOrderRequestSchema = z.object({
  requestType: z.enum(BULK_REQUEST_TYPES),
  contact: contactSchema,
  eventDate: dateString,
  guestCount: z.number().int().min(1).max(1_000_000),
  budgetMinor: money.nullable().default(null),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("USD"),
  productsRequired: z.string().trim().min(3).max(5000),
  deliveryAddress: bulkAddressSchema,
  specialInstructions: z.string().trim().max(5000).default(""),
}).strict();

export const bulkRequestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  requestType: z.enum(BULK_REQUEST_TYPES).optional(),
  status: z.enum(BULK_REQUEST_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});

export const updateBulkRequestSchema = z.object({
  status: z.enum(BULK_REQUEST_STATUSES).optional(),
  internalNotes: z.string().trim().max(5000).optional(),
}).strict().refine((value) => value.status !== undefined || value.internalNotes !== undefined, {
  message: "At least one request field must be updated.",
});

const quoteLineSchema = z.object({
  lineType: z.enum(["PRODUCT", "CUSTOM"]),
  productId: objectId.nullable().default(null),
  variantId: objectId.nullable().default(null),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000),
  unitPriceMinor: money,
}).strict().superRefine((line, ctx) => {
  if (line.lineType === "PRODUCT" && (!line.productId || !line.variantId)) {
    ctx.addIssue({
      code: "custom",
      message: "Product quote lines require both productId and variantId.",
      path: ["productId"],
    });
  }
  if (line.lineType === "CUSTOM" && (line.productId || line.variantId)) {
    ctx.addIssue({
      code: "custom",
      message: "Custom quote lines cannot reference a product variant.",
      path: ["productId"],
    });
  }
});

const quoteInputBaseSchema = z.object({
  requestId: objectId,
  storeId: objectId,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("USD"),
  lines: z.array(quoteLineSchema).min(1).max(100),
  discountMinor: money.default(0),
  taxMinor: money.default(0),
  deliveryFeeMinor: money.default(0),
  depositMode: z.enum(QUOTE_DEPOSIT_MODES).default("NONE"),
  depositFixedMinor: money.nullable().default(null),
  depositPercentBasisPoints: z.number().int().min(0).max(10_000).nullable().default(null),
  validUntil: dateString,
  customerMessage: z.string().trim().max(5000).default(""),
  internalNotes: z.string().trim().max(5000).default(""),
}).strict();

export const createQuoteSchema = quoteInputBaseSchema.superRefine((value, ctx) => {
  if (value.depositMode === "FIXED" && value.depositFixedMinor === null) {
    ctx.addIssue({ code: "custom", message: "Fixed deposits require depositFixedMinor.", path: ["depositFixedMinor"] });
  }
  if (value.depositMode === "PERCENTAGE" && value.depositPercentBasisPoints === null) {
    ctx.addIssue({ code: "custom", message: "Percentage deposits require depositPercentBasisPoints.", path: ["depositPercentBasisPoints"] });
  }
});

export const updateQuoteSchema = quoteInputBaseSchema.omit({ requestId: true }).partial().strict();

export const quoteListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(QUOTE_STATUSES).optional(),
  requestId: objectId.optional(),
  search: z.string().trim().max(120).optional(),
});

export const bulkIdParamSchema = z.object({ id: objectId });
export const publicQuoteAccessSchema = z.object({ token: z.string().trim().min(32).max(512) });
export const quoteDepositIntentSchema = z.object({ idempotencyKey: z.string().trim().min(12).max(180) }).strict();

export const quoteConversionSchema = z.object({
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  deliverySlotId: objectId.optional(),
  pickupSlotId: objectId.optional(),
  deliveryAddress: bulkAddressSchema.extend({
    deliveryInstructions: z.string().trim().max(500).default(""),
  }).optional(),
  customerNotes: z.string().trim().max(1000).default(""),
}).strict().superRefine((value, ctx) => {
  if (value.fulfillmentType === "DELIVERY") {
    if (!value.deliverySlotId) {
      ctx.addIssue({ code: "custom", message: "Delivery conversion requires a deliverySlotId.", path: ["deliverySlotId"] });
    }
    if (!value.deliveryAddress) {
      ctx.addIssue({ code: "custom", message: "Delivery conversion requires a deliveryAddress.", path: ["deliveryAddress"] });
    }
  }
  if (value.fulfillmentType === "PICKUP" && !value.pickupSlotId) {
    ctx.addIssue({ code: "custom", message: "Pickup conversion requires a pickupSlotId.", path: ["pickupSlotId"] });
  }
});
