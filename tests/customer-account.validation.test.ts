import { describe, expect, it } from "vitest";

import {
  addressInputSchema,
  profileUpdateSchema,
  reorderValidationSchema,
} from "../src/modules/customer-account/customer-account.validation.js";

describe("customer account validation", () => {
  it("accepts a valid customer profile and address", () => {
    expect(profileUpdateSchema.parse({ firstName: "Harsh", lastName: "Panchal", phone: "+1 555 0100" }).firstName).toBe("Harsh");
    expect(addressInputSchema.parse({
      label: "Home",
      recipientName: "Harsh Panchal",
      phone: "+1 555 0100",
      line1: "1 Market Street",
      city: "Jersey City",
      state: "NJ",
      postalCode: "07302",
      country: "USA",
      isDefault: true,
    }).line2).toBe("");
  });

  it("rejects malformed ids and invalid reorder quantities", () => {
    expect(() => reorderValidationSchema.parse({ storeId: "bad", items: [] })).toThrow();
    expect(() => reorderValidationSchema.parse({
      items: [{ productId: "507f1f77bcf86cd799439011", variantId: "507f1f77bcf86cd799439012", quantity: 0 }],
    })).toThrow();
  });
});
