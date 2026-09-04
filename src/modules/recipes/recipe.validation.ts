import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amount: z.number().min(0).nullable().optional(),
  unit: z.string().trim().max(40).default(""),
  note: z.string().trim().max(300).default(""),
  productId: objectId.nullable().optional(),
  variantId: objectId.nullable().optional(),
  cartQuantity: z.number().positive().default(1),
  optional: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if ((value.productId && !value.variantId) || (!value.productId && value.variantId)) {
    ctx.addIssue({ code: "custom", path: ["variantId"], message: "Product and variant must be mapped together." });
  }
});

const recipeFields = z.object({
  name: z.string().trim().min(2).max(180),
  slug: z.string().trim().toLowerCase().min(2).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  shortDescription: z.string().trim().max(320).default(""),
  description: z.string().trim().max(5000).default(""),
  imageUrl: z.string().trim().max(1000).default(""),
  preparationMinutes: z.number().int().min(0).max(1440).default(0),
  cookingMinutes: z.number().int().min(0).max(1440).default(0),
  servings: z.number().int().min(1).max(1000).default(1),
  cuisine: z.string().trim().max(100).default(""),
  dietary: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  steps: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  ingredients: z.array(ingredientSchema).min(1).max(100),
  mealKitBundleId: objectId.nullable().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  seo: z.object({
    title: z.string().trim().max(180).default(""),
    description: z.string().trim().max(320).default(""),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  }).default({ title: "", description: "", keywords: [] }),
});

export const recipeInputSchema = recipeFields;
export const recipeUpdateSchema = recipeFields.partial().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });
export const recipeIdParamSchema = z.object({ id: objectId });
export const recipeSlugParamSchema = z.object({ slug: z.string().trim().toLowerCase().min(2).max(200) });
export const recipeListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  cuisine: z.string().trim().max(100).optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export const addRecipeIngredientsSchema = z.object({
  storeId: objectId,
  ingredientIds: z.array(objectId).max(100).optional(),
});
