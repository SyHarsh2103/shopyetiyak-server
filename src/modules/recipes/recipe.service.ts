import type { z } from "zod";

import { BundleModel } from "../bundles/bundle.model.js";
import { addCartItems, type CartOwner } from "../carts/cart.service.js";
import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { RecipeModel } from "./recipe.model.js";
import type { recipeInputSchema, recipeListQuerySchema, recipeUpdateSchema } from "./recipe.validation.js";

type RecipeInput = z.infer<typeof recipeInputSchema>;
type RecipeUpdate = z.infer<typeof recipeUpdateSchema>;
type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;

async function validateMappings(input: { ingredients?: RecipeInput["ingredients"]; mealKitBundleId?: string | null }) {
  const ingredients = input.ingredients ?? [];
  for (const ingredient of ingredients) {
    if (!ingredient.productId || !ingredient.variantId) continue;
    const product = await ProductModel.findOne({
      _id: ingredient.productId,
      archivedAt: null,
      variants: { $elemMatch: { _id: ingredient.variantId } },
    }).lean();
    if (!product) {
      throw new ApiError(409, "RECIPE_PRODUCT_MAPPING_INVALID", `Ingredient '${ingredient.name}' references an unavailable product variant.`);
    }
  }

  if (input.mealKitBundleId) {
    const bundle = await BundleModel.findOne({ _id: input.mealKitBundleId, isActive: true, bundleType: "MEAL_KIT" }).lean();
    if (!bundle) throw new ApiError(409, "RECIPE_MEAL_KIT_INVALID", "The selected meal kit bundle is not an active MEAL_KIT bundle.");
  }
}

export async function listAdminRecipes(query: RecipeListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { cuisine: regex }];
  }
  if (query.cuisine) filter.cuisine = query.cuisine;
  if (query.featured !== undefined) filter.isFeatured = query.featured;
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    RecipeModel.find(filter).sort({ isFeatured: -1, createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    RecipeModel.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) } };
}

export async function createRecipe(input: RecipeInput) {
  await validateMappings(input);
  return RecipeModel.create(input);
}

export async function updateRecipe(id: string, input: RecipeUpdate) {
  if (input.ingredients || input.mealKitBundleId !== undefined) {
    await validateMappings({ ingredients: input.ingredients, mealKitBundleId: input.mealKitBundleId });
  }
  const record = await RecipeModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true });
  if (!record) throw new ApiError(404, "RECIPE_NOT_FOUND", "Recipe was not found.");
  return record;
}

export async function listPublicRecipes(query: RecipeListQuery) {
  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { shortDescription: regex }, { cuisine: regex }, { dietary: regex }];
  }
  if (query.cuisine) filter.cuisine = query.cuisine;
  if (query.featured !== undefined) filter.isFeatured = query.featured;
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    RecipeModel.find(filter).sort({ isFeatured: -1, createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    RecipeModel.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) } };
}

export async function getPublicRecipe(slug: string) {
  const recipe = await RecipeModel.findOne({ slug, isActive: true }).lean();
  if (!recipe) throw new ApiError(404, "RECIPE_NOT_FOUND", "Recipe was not found.");

  const mappedIds = recipe.ingredients.flatMap((ingredient) => ingredient.productId ? [ingredient.productId] : []);
  const products = mappedIds.length > 0
    ? await ProductModel.find({ _id: { $in: mappedIds }, isActive: true, archivedAt: null }).select({ name: 1, slug: 1, images: 1, variants: 1 }).lean()
    : [];
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const mealKit = recipe.mealKitBundleId ? await BundleModel.findOne({ _id: recipe.mealKitBundleId, isActive: true, bundleType: "MEAL_KIT" }).lean() : null;

  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      mappedProduct: ingredient.productId ? productMap.get(ingredient.productId.toString()) ?? null : null,
    })),
    mealKit,
  };
}

export async function addRecipeIngredientsToCart(
  slug: string,
  owner: CartOwner,
  storeId: string,
  ingredientIds?: string[],
) {
  const recipe = await RecipeModel.findOne({ slug, isActive: true });
  if (!recipe) throw new ApiError(404, "RECIPE_NOT_FOUND", "Recipe was not found.");

  const selected = ingredientIds?.length ? new Set(ingredientIds) : null;
  const items = recipe.ingredients.flatMap((ingredient) => {
    if (selected && !selected.has(ingredient._id.toString())) return [];
    if (!ingredient.productId || !ingredient.variantId) return [];
    return [{
      productId: ingredient.productId.toString(),
      variantId: ingredient.variantId.toString(),
      quantity: ingredient.cartQuantity,
    }];
  });

  if (items.length === 0) throw new ApiError(400, "RECIPE_NO_MAPPED_INGREDIENTS", "No selected recipe ingredients are mapped to products.");
  return addCartItems(owner, storeId, items);
}

export async function addMealKitToCart(slug: string, owner: CartOwner, storeId: string) {
  const recipe = await RecipeModel.findOne({ slug, isActive: true }).lean();
  if (!recipe) throw new ApiError(404, "RECIPE_NOT_FOUND", "Recipe was not found.");
  if (!recipe.mealKitBundleId) throw new ApiError(400, "RECIPE_MEAL_KIT_NOT_CONFIGURED", "This recipe does not have a meal kit.");
  const bundle = await BundleModel.findOne({ _id: recipe.mealKitBundleId, isActive: true, bundleType: "MEAL_KIT" });
  if (!bundle) throw new ApiError(409, "RECIPE_MEAL_KIT_UNAVAILABLE", "The configured meal kit is unavailable.");
  return addCartItems(owner, storeId, bundle.components.map((component) => ({
    productId: component.productId.toString(),
    variantId: component.variantId.toString(),
    quantity: component.quantity,
  })));
}

export async function listPublicMealKits() {
  const now = new Date();
  return BundleModel.find({
    bundleType: "MEAL_KIT",
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).sort({ isFeatured: -1, createdAt: -1 }).lean();
}

export async function addMealKitBundleToCart(bundleSlug: string, owner: CartOwner, storeId: string) {
  const now = new Date();
  const bundle = await BundleModel.findOne({
    slug: bundleSlug,
    bundleType: "MEAL_KIT",
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  });
  if (!bundle) throw new ApiError(404, "MEAL_KIT_NOT_FOUND", "Meal kit was not found or is not currently available.");
  return addCartItems(owner, storeId, bundle.components.map((component) => ({
    productId: component.productId.toString(),
    variantId: component.variantId.toString(),
    quantity: component.quantity,
  })));
}
