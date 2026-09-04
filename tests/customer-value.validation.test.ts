import { describe, expect, it } from "vitest";

import {
  adminGiftCardCreateSchema,
  adminLoyaltyAdjustmentSchema,
  backInStockSubscribeSchema,
  valueRedemptionInputSchema,
} from "../src/modules/customer-value/customer-value.validation.js";

const id = "64b64c7f2f7b2c0012345678";

describe("Phase 15 customer-value validation", () => {
  it("normalizes redemption defaults", () => {
    expect(valueRedemptionInputSchema.parse({})).toEqual({
      loyaltyPoints: 0,
      storeCreditMinor: 0,
      giftCardMinor: 0,
    });
  });

  it("requires a non-zero loyalty adjustment", () => {
    expect(() => adminLoyaltyAdjustmentSchema.parse({ customerId: id, pointsDelta: 0, note: "test" })).toThrow();
  });

  it("normalizes gift-card currency", () => {
    const parsed = adminGiftCardCreateSchema.parse({
      currency: "usd",
      initialBalanceMinor: 5000,
      expiresAt: null,
      recipientEmail: "recipient@example.com",
      note: "Birthday",
    });
    expect(parsed.currency).toBe("USD");
  });

  it("accepts a back-in-stock subscription", () => {
    const parsed = backInStockSubscribeSchema.parse({
      storeId: id,
      productId: id,
      variantId: id,
      email: "SHOPPER@EXAMPLE.COM",
    });
    expect(parsed.email).toBe("SHOPPER@EXAMPLE.COM");
  });
});
