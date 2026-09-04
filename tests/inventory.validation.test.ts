import { describe, expect, it } from "vitest";
import {
  inventoryAdjustmentSchema,
  inventoryTransferSchema,
  receiveBatchSchema,
} from "../src/modules/inventory/inventory.validation.js";

const objectId = "507f1f77bcf86cd799439011";
const otherObjectId = "507f1f77bcf86cd799439012";

describe("inventory validation", () => {
  it("rejects transfers where source and target are the same store", () => {
    const result = inventoryTransferSchema.safeParse({
      sourceStoreId: objectId,
      targetStoreId: objectId,
      productId: otherObjectId,
      variantId: "507f1f77bcf86cd799439013",
      quantity: 2,
      note: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an expiry date before the received date", () => {
    const result = receiveBatchSchema.safeParse({
      storeId: objectId,
      productId: otherObjectId,
      variantId: "507f1f77bcf86cd799439013",
      batchNumber: "BATCH-1",
      receivedDate: "2026-08-12",
      expiryDate: "2026-08-11",
      receivedQuantity: 10,
      costPriceMinor: 100,
    });
    expect(result.success).toBe(false);
  });

  it("requires reservation movements to use the reservation workflow", () => {
    const result = inventoryAdjustmentSchema.safeParse({
      storeId: objectId,
      productId: otherObjectId,
      variantId: "507f1f77bcf86cd799439013",
      operation: "DECREASE",
      quantity: 1,
      transactionType: "ORDER_RESERVATION",
      reason: "OTHER",
      note: "",
    });
    expect(result.success).toBe(false);
  });
});
