import { describe, expect, it } from "vitest";

import {
  createBulkOrderRequestSchema,
  createQuoteSchema,
  quoteConversionSchema,
} from "../src/modules/bulk-orders/bulk-order.validation.js";

const id = "64b64c7f2f7b2c0012345678";

const address = {
  recipientName: "Asha Shah",
  phone: "555-0100",
  line1: "1 Grove Street",
  line2: "",
  city: "Jersey City",
  state: "NJ",
  postalCode: "07302",
  country: "USA",
};

describe("Phase 14 bulk-order validation", () => {
  it("accepts a wedding inquiry", () => {
    const result = createBulkOrderRequestSchema.parse({
      requestType: "WEDDING",
      contact: {
        firstName: "Asha",
        lastName: "Shah",
        email: "ASHA@EXAMPLE.COM",
        phone: "555-0100",
      },
      eventDate: "2099-10-12T18:00:00.000Z",
      guestCount: 250,
      budgetMinor: 250000,
      currency: "usd",
      productsRequired: "Sweets, beverages, and party groceries.",
      deliveryAddress: address,
      specialInstructions: "Call before delivery.",
    });

    expect(result.requestType).toBe("WEDDING");
    expect(result.contact.email).toBe("asha@example.com");
    expect(result.currency).toBe("USD");
  });

  it("requires both product and variant identifiers on product quote lines", () => {
    expect(() => createQuoteSchema.parse({
      requestId: id,
      storeId: id,
      currency: "USD",
      lines: [{
        lineType: "PRODUCT",
        productId: id,
        variantId: null,
        description: "Rice",
        quantity: 10,
        unitPriceMinor: 499,
      }],
      discountMinor: 0,
      taxMinor: 0,
      deliveryFeeMinor: 0,
      depositMode: "NONE",
      depositFixedMinor: null,
      depositPercentBasisPoints: null,
      validUntil: "2099-10-01T00:00:00.000Z",
    })).toThrow("Product quote lines require both productId and variantId.");
  });

  it("requires a deposit value for percentage deposits", () => {
    expect(() => createQuoteSchema.parse({
      requestId: id,
      storeId: id,
      currency: "USD",
      lines: [{
        lineType: "CUSTOM",
        productId: null,
        variantId: null,
        description: "Event packing service",
        quantity: 1,
        unitPriceMinor: 5000,
      }],
      discountMinor: 0,
      taxMinor: 0,
      deliveryFeeMinor: 0,
      depositMode: "PERCENTAGE",
      depositFixedMinor: null,
      depositPercentBasisPoints: null,
      validUntil: "2099-10-01T00:00:00.000Z",
    })).toThrow("Percentage deposits require depositPercentBasisPoints.");
  });

  it("requires the correct fulfillment fields for quote conversion", () => {
    expect(() => quoteConversionSchema.parse({
      fulfillmentType: "DELIVERY",
      customerNotes: "",
    })).toThrow("Delivery conversion requires a deliverySlotId.");

    expect(() => quoteConversionSchema.parse({
      fulfillmentType: "PICKUP",
      customerNotes: "",
    })).toThrow("Pickup conversion requires a pickupSlotId.");
  });
});
