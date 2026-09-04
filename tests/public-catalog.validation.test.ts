import { describe, expect, it } from "vitest";

import { publicCatalogListQuerySchema, publicSearchSuggestionQuerySchema } from "../src/modules/public-catalog/public-catalog.validation.js";

describe("public catalog validation", () => {
  it("parses storefront filters and sorting", () => {
    const result = publicCatalogListQuerySchema.safeParse({
      page: "2",
      limit: "24",
      q: "basmati",
      inStock: "true",
      organic: "false",
      minPriceMinor: "100",
      maxPriceMinor: "2500",
      sort: "price_asc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.inStock).toBe(true);
      expect(result.data.organic).toBe(false);
    }
  });

  it("rejects an inverted price range", () => {
    expect(publicCatalogListQuerySchema.safeParse({ minPriceMinor: "5000", maxPriceMinor: "1000" }).success).toBe(false);
  });

  it("requires at least two characters for autocomplete", () => {
    expect(publicSearchSuggestionQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(publicSearchSuggestionQuerySchema.safeParse({ q: "ap" }).success).toBe(true);
  });
});
