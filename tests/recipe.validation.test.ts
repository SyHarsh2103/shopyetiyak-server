import { describe, expect, it } from "vitest";
import { recipeInputSchema } from "../src/modules/recipes/recipe.validation.js";

const id = "64b64c7f2f7b2c0012345678";

describe("Phase 13 recipe validation", () => {
  it("accepts mapped recipe ingredients and meal-kit metadata", () => {
    const result = recipeInputSchema.parse({
      name: "Paneer Tikka",
      slug: "paneer-tikka",
      shortDescription: "A quick paneer tikka recipe.",
      description: "A quick paneer tikka recipe.",
      preparationMinutes: 15,
      cookingMinutes: 20,
      servings: 4,
      cuisine: "Indian",
      dietary: ["Vegetarian"],
      steps: ["Mix marinade.", "Cook paneer."],
      ingredients: [{ name: "Paneer", amount: 500, unit: "g", productId: id, variantId: id, cartQuantity: 1, optional: false }],
      mealKitBundleId: id,
      isFeatured: true,
      isActive: true,
      seo: { title: "Paneer Tikka", description: "Paneer tikka recipe", keywords: ["paneer"] },
    });
    expect(result.ingredients[0]?.productId).toBe(id);
    expect(result.mealKitBundleId).toBe(id);
  });

  it("rejects a half-configured product mapping", () => {
    expect(() => recipeInputSchema.parse({
      name: "Test Recipe",
      slug: "test-recipe",
      ingredients: [{ name: "Rice", productId: id }],
    })).toThrow("Product and variant must be mapped together.");
  });
});
