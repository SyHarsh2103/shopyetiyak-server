import { describe, expect, it } from "vitest";
import { promotionInputSchema } from "../src/modules/promotions/promotion.validation.js";
import { couponInputSchema } from "../src/modules/promotions/marketing.validation.js";
import { bundleInputSchema } from "../src/modules/bundles/bundle.validation.js";

describe("Phase 12 marketing validation", () => {
  it("requires a value for percentage promotions", () => {
    expect(promotionInputSchema.safeParse({ name: "Weekly", slug: "weekly", type: "PERCENTAGE", scope: "CART", currency: "USD" }).success).toBe(false);
    expect(promotionInputSchema.safeParse({ name: "Weekly", slug: "weekly", type: "PERCENTAGE", scope: "CART", percentageBasisPoints: 1000, currency: "USD" }).success).toBe(true);
  });

  it("validates coupon discount configuration", () => {
    expect(couponInputSchema.safeParse({ code: "SAVE10", discountType: "PERCENTAGE", percentageBasisPoints: 1000 }).success).toBe(true);
    expect(couponInputSchema.safeParse({ code: "SAVE10", discountType: "FIXED" }).success).toBe(false);
  });

  it("requires real product/variant components for bundles", () => {
    const id = "64b000000000000000000001";
    expect(bundleInputSchema.safeParse({ name: "Puja Pack", slug: "puja-pack", components: [{ productId: id, variantId: id, quantity: 1 }], pricingMode: "SUM_COMPONENTS" }).success).toBe(true);
  });
});
