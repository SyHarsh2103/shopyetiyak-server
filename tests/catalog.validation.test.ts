import { describe, expect, it } from "vitest";
import { createProductSchema } from "../src/modules/products/product.validation.js";

const baseProduct = {
  name: "Basmati Rice 5 KG",
  productType: "PACKAGED" as const,
  variants: [{
    sku: "RICE-5KG",
    pricing: { currency: "USD", costPriceMinor: 900, regularPriceMinor: 1499, salePriceMinor: 1299 },
    sellingUnit: "BAG" as const,
    unitQuantity: 1,
    minimumQuantity: 1,
    maximumQuantity: 10,
    quantityIncrement: 1,
  }],
};

describe("product catalog validation", () => {
  it("accepts a valid product with one variant", () => {
    const result = createProductSchema.parse(baseProduct);
    expect(result.variants[0]?.sku).toBe("RICE-5KG");
    expect(result.dietary.organic).toBe(false);
  });

  it("rejects duplicate SKU values inside one product", () => {
    const result = createProductSchema.safeParse({
      ...baseProduct,
      variants: [baseProduct.variants[0], { ...baseProduct.variants[0], sku: "rice-5kg" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sale price above regular price", () => {
    const result = createProductSchema.safeParse({
      ...baseProduct,
      variants: [{ ...baseProduct.variants[0], pricing: { currency: "USD", costPriceMinor: 900, regularPriceMinor: 1000, salePriceMinor: 1200 } }],
    });
    expect(result.success).toBe(false);
  });
});
