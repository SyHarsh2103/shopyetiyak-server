import { describe, expect, it } from "vitest";

import {
  createPurchaseOrderSchema,
  goodsReceiptSchema,
  supplierReturnSchema,
} from "../src/modules/purchasing/purchasing.validation.js";

const supplierId = "507f1f77bcf86cd799439011";
const storeId = "507f1f77bcf86cd799439012";
const productId = "507f1f77bcf86cd799439013";
const variantId = "507f1f77bcf86cd799439014";
const itemId = "507f1f77bcf86cd799439015";
const batchId = "507f1f77bcf86cd799439016";

describe("purchasing validation", () => {
  it("rejects duplicate product variants on a purchase order", () => {
    const result = createPurchaseOrderSchema.safeParse({
      supplierId,
      storeId,
      currency: "usd",
      items: [
        { productId, variantId, orderedQuantity: 10, unitCostMinor: 500 },
        { productId, variantId, orderedQuantity: 5, unitCostMinor: 500 },
      ],
      expectedDeliveryDate: null,
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects damaged receiving quantity above delivered quantity", () => {
    const result = goodsReceiptSchema.safeParse({
      purchaseOrderId: supplierId,
      receivedAt: "2026-08-12T12:00:00.000Z",
      items: [{
        purchaseOrderItemId: itemId,
        batchNumber: "LOT-1",
        quantityReceived: 5,
        damagedQuantity: 6,
        manufacturingDate: null,
        expiryDate: null,
      }],
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires supplier returns to identify a tracked batch", () => {
    const result = supplierReturnSchema.safeParse({
      supplierId,
      storeId,
      purchaseOrderId: null,
      goodsReceiptId: null,
      items: [{ batchId, quantity: 2, reason: "Damaged packaging" }],
      notes: "",
    });
    expect(result.success).toBe(true);
  });
});
