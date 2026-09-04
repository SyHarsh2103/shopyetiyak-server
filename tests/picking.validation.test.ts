import { describe, expect, it } from "vitest";

import {
  markPickedSchema,
  markUnavailableSchema,
  substituteItemSchema,
} from "../src/modules/picking/picking.validation.js";

describe("Phase 10 picking validation", () => {
  it("accepts actual weight and rejects non-positive picking values", () => {
    expect(markPickedSchema.parse({ actualWeight: 1.25, batchId: null })).toMatchObject({ actualWeight: 1.25 });
    expect(() => markPickedSchema.parse({ pickedQuantity: 0 })).toThrow();
  });

  it("requires an unavailable reason", () => {
    expect(() => markUnavailableSchema.parse({ reason: "" })).toThrow();
    expect(markUnavailableSchema.parse({ reason: "Out of stock" }).reason).toBe("Out of stock");
  });

  it("validates substitution identifiers and quantity", () => {
    const objectId = "507f1f77bcf86cd799439011";
    const parsed = substituteItemSchema.parse({
      replacementProductId: objectId,
      replacementVariantId: objectId,
      replacementQuantity: 2,
      customerApproved: true,
      reason: "Customer approved replacement",
    });
    expect(parsed.replacementQuantity).toBe(2);
    expect(() => substituteItemSchema.parse({ ...parsed, replacementQuantity: -1 })).toThrow();
  });
});
