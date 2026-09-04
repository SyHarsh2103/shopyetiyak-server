import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { PURCHASE_ORDER_STATUSES } from "./purchase-order.model.js";

const positiveQuantity = z.number().finite().positive().max(1_000_000);
const moneyMinor = z.number().int().nonnegative().max(1_000_000_000);

const purchaseOrderItemInputSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema,
  orderedQuantity: positiveQuantity,
  unitCostMinor: moneyMinor,
}).strict();

const purchaseOrderFields = z.object({
  supplierId: objectIdSchema,
  storeId: objectIdSchema,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  items: z.array(purchaseOrderItemInputSchema).min(1).max(250),
  expectedDeliveryDate: z.coerce.date().nullable().optional().default(null),
  notes: z.string().trim().max(3000).optional().default(""),
}).strict();

function duplicateItemIssue(
  value: { items: Array<{ productId: string; variantId: string }> },
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.productId}:${item.variantId}`;
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["items", index],
        message: "The same product variant cannot appear twice on one purchase order.",
      });
    }
    seen.add(key);
  });
}

export const createPurchaseOrderSchema = purchaseOrderFields.superRefine(duplicateItemIssue);
export const updatePurchaseOrderSchema = purchaseOrderFields.partial().superRefine((value, context) => {
  if (Object.keys(value).length === 0) {
    context.addIssue({ code: "custom", message: "At least one purchase order field must be provided." });
  }
  if (value.items) duplicateItemIssue({ items: value.items }, context);
});

export const purchaseOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
  supplierId: objectIdSchema.optional(),
  storeId: objectIdSchema.optional(),
  status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
}).strict();

export const purchaseOrderTransitionSchema = z.object({
  status: z.enum(["APPROVED", "SENT", "CANCELLED", "CLOSED"]),
  note: z.string().trim().max(1000).optional().default(""),
}).strict();

const goodsReceiptItemSchema = z.object({
  purchaseOrderItemId: objectIdSchema,
  batchNumber: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  quantityReceived: positiveQuantity,
  damagedQuantity: z.number().finite().nonnegative().max(1_000_000).default(0),
  unitCostMinor: moneyMinor.optional(),
  manufacturingDate: z.coerce.date().nullable().optional().default(null),
  expiryDate: z.coerce.date().nullable().optional().default(null),
}).strict().superRefine((value, context) => {
  if (value.damagedQuantity > value.quantityReceived) {
    context.addIssue({ code: "custom", path: ["damagedQuantity"], message: "Damaged quantity cannot exceed received quantity." });
  }
  if (value.manufacturingDate && value.expiryDate && value.expiryDate < value.manufacturingDate) {
    context.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry date cannot be before manufacturing date." });
  }
});

export const goodsReceiptSchema = z.object({
  purchaseOrderId: objectIdSchema,
  receivedAt: z.coerce.date().optional().default(() => new Date()),
  items: z.array(goodsReceiptItemSchema).min(1).max(250),
  notes: z.string().trim().max(3000).optional().default(""),
}).strict();

export const goodsReceiptListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  purchaseOrderId: objectIdSchema.optional(),
  supplierId: objectIdSchema.optional(),
  storeId: objectIdSchema.optional(),
}).strict();

const supplierReturnItemSchema = z.object({
  batchId: objectIdSchema,
  quantity: positiveQuantity,
  reason: z.string().trim().min(2).max(500),
}).strict();

export const supplierReturnSchema = z.object({
  supplierId: objectIdSchema,
  storeId: objectIdSchema,
  purchaseOrderId: objectIdSchema.nullable().optional().default(null),
  goodsReceiptId: objectIdSchema.nullable().optional().default(null),
  items: z.array(supplierReturnItemSchema).min(1).max(100),
  notes: z.string().trim().max(3000).optional().default(""),
}).strict();

export const supplierReturnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  supplierId: objectIdSchema.optional(),
  storeId: objectIdSchema.optional(),
  purchaseOrderId: objectIdSchema.optional(),
}).strict();
