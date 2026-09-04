import { describe, expect, it } from "vitest";

import {
  cartBulkItemsSchema,
  cartCouponSchema,
  cartItemSchema,
} from "../src/modules/carts/cart.validation.js";

describe("cart validation", () => {
  const id = "64b64c2f2f9e4d8f1a2b3c4d";
  const variantId = "64b64c2f2f9e4d8f1a2b3c4e";

  it("accepts positive decimal quantities and normalized coupon codes", () => {
    expect(cartItemSchema.parse({ storeId: id, productId: id, variantId, quantity: 1.25 }).quantity).toBe(1.25);
    expect(cartCouponSchema.parse({ storeId: id, code: " save10 " }).code).toBe("SAVE10");
  });

  it("bounds bulk cart imports", () => {
    expect(() => cartBulkItemsSchema.parse({ storeId: id, items: [] })).toThrow();
    expect(cartBulkItemsSchema.parse({
      storeId: id,
      items: [{ productId: id, variantId, quantity: 2 }],
    }).items).toHaveLength(1);
  });
});
