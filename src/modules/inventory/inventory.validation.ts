import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { INVENTORY_ADJUSTMENT_REASONS, INVENTORY_TRANSACTION_TYPES } from "./inventory-transaction.model.js";

const positiveQuantity = z.number().finite().positive().max(1_000_000);
const nonNegativeQuantity = z.number().finite().nonnegative().max(1_000_000);

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  storeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "low", "out"]).default("all"),
}).strict();

export const updateReorderPolicySchema = z.object({
  reorderLevel: nonNegativeQuantity,
  reorderQuantity: nonNegativeQuantity,
}).strict();

export const receiveBatchSchema = z.object({
  storeId: objectIdSchema,
  productId: objectIdSchema,
  variantId: objectIdSchema,
  batchNumber: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  supplierId: objectIdSchema.nullable().optional().default(null),
  supplierName: z.string().trim().max(180).optional().default(""),
  receivedDate: z.coerce.date(),
  manufacturingDate: z.coerce.date().nullable().optional().default(null),
  expiryDate: z.coerce.date().nullable().optional().default(null),
  receivedQuantity: positiveQuantity,
  costPriceMinor: z.number().int().nonnegative().max(1_000_000_000),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional().default("USD"),
  note: z.string().trim().max(1000).optional().default(""),
}).strict().superRefine((value, context) => {
  if (value.manufacturingDate && value.manufacturingDate > value.receivedDate) {
    context.addIssue({ code: "custom", path: ["manufacturingDate"], message: "Manufacturing date cannot be after received date." });
  }
  if (value.expiryDate && value.expiryDate < value.receivedDate) {
    context.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry date cannot be before received date." });
  }
});

export const batchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  storeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  expiry: z.enum(["all", "expired", "7", "15", "30"]).default("all"),
}).strict();

export const inventoryAdjustmentSchema = z.object({
  storeId: objectIdSchema,
  productId: objectIdSchema,
  variantId: objectIdSchema,
  operation: z.enum(["INCREASE", "DECREASE"]),
  quantity: positiveQuantity,
  transactionType: z.enum(INVENTORY_TRANSACTION_TYPES).refine(
    (value) => !["PURCHASE_RECEIPT", "ORDER_RESERVATION", "ORDER_COMMIT", "ORDER_RELEASE", "TRANSFER_IN", "TRANSFER_OUT"].includes(value),
    "Use the dedicated inventory workflow for this transaction type.",
  ),
  reason: z.enum(INVENTORY_ADJUSTMENT_REASONS),
  batchId: objectIdSchema.nullable().optional().default(null),
  note: z.string().trim().max(1000).optional().default(""),
}).strict();

export const inventoryReservationSchema = z.object({
  storeId: objectIdSchema,
  productId: objectIdSchema,
  variantId: objectIdSchema,
  quantity: positiveQuantity,
  referenceType: z.string().trim().min(1).max(60),
  referenceId: z.string().trim().min(1).max(160),
  note: z.string().trim().max(1000).optional().default(""),
}).strict();

export const inventoryTransferSchema = z.object({
  sourceStoreId: objectIdSchema,
  targetStoreId: objectIdSchema,
  productId: objectIdSchema,
  variantId: objectIdSchema,
  quantity: positiveQuantity,
  note: z.string().trim().max(1000).optional().default(""),
}).strict().refine(
  (value) => value.sourceStoreId !== value.targetStoreId,
  { path: ["targetStoreId"], message: "Source and target stores must be different." },
);

export const transactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  storeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  type: z.enum(INVENTORY_TRANSACTION_TYPES).optional(),
  referenceId: z.string().trim().max(160).optional(),
}).strict();
