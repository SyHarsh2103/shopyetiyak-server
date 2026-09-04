import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { COOKIE_NAMES, setGuestCartCookie } from "../../utils/cookies.js";
import { createOpaqueToken } from "../../utils/crypto.js";
import { ApiError } from "../../utils/api-error.js";
import type { CartOwner } from "../carts/cart.service.js";
import {
  addMealKitBundleToCart,
  addMealKitToCart,
  addRecipeIngredientsToCart,
  createRecipe,
  getPublicRecipe,
  listAdminRecipes,
  listPublicMealKits,
  listPublicRecipes,
  updateRecipe,
} from "./recipe.service.js";
import {
  addRecipeIngredientsSchema,
  recipeIdParamSchema,
  recipeInputSchema,
  recipeListQuerySchema,
  recipeSlugParamSchema,
  recipeUpdateSchema,
} from "./recipe.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  return req.auth;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function owner(req: Request, res: Response): CartOwner {
  const customerId = req.auth?.kind === "customer" ? req.auth.customerId : undefined;
  let guestToken = readCookie(req, COOKIE_NAMES.guestCart);
  if (!customerId && !guestToken) {
    guestToken = createOpaqueToken();
    setGuestCartCookie(res, guestToken);
  }
  return { customerId, guestToken };
}

export async function getAdminRecipes(req: Request, res: Response) {
  admin(req);
  const query = recipeListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listAdminRecipes(query) });
}

export async function postRecipe(req: Request, res: Response) {
  const identity = admin(req);
  const input = recipeInputSchema.parse(req.body);
  const record = await createRecipe(input);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "RECIPE_CREATED", entityType: "Recipe", entityId: record.id, after: input, request: req });
  res.status(201).json({ success: true, data: { recipe: record } });
}

export async function patchRecipe(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = recipeIdParamSchema.parse(req.params);
  const input = recipeUpdateSchema.parse(req.body);
  const record = await updateRecipe(id, input);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "RECIPE_UPDATED", entityType: "Recipe", entityId: id, after: input, request: req });
  res.status(200).json({ success: true, data: { recipe: record } });
}

export async function getRecipes(req: Request, res: Response) {
  const query = recipeListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPublicRecipes(query) });
}

export async function getRecipe(req: Request, res: Response) {
  const { slug } = recipeSlugParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { recipe: await getPublicRecipe(slug) } });
}

export async function postRecipeIngredientsToCart(req: Request, res: Response) {
  const { slug } = recipeSlugParamSchema.parse(req.params);
  const input = addRecipeIngredientsSchema.parse(req.body);
  const data = await addRecipeIngredientsToCart(slug, owner(req, res), input.storeId, input.ingredientIds);
  res.status(201).json({ success: true, data });
}

export async function postMealKitToCart(req: Request, res: Response) {
  const { slug } = recipeSlugParamSchema.parse(req.params);
  const { storeId } = addRecipeIngredientsSchema.pick({ storeId: true }).parse(req.body);
  const data = await addMealKitToCart(slug, owner(req, res), storeId);
  res.status(201).json({ success: true, data });
}

export async function getMealKits(_req: Request, res: Response) {
  res.status(200).json({ success: true, data: { mealKits: await listPublicMealKits() } });
}

export async function postMealKitBundleToCart(req: Request, res: Response) {
  const { slug } = recipeSlugParamSchema.parse(req.params);
  const { storeId } = addRecipeIngredientsSchema.pick({ storeId: true }).parse(req.body);
  const data = await addMealKitBundleToCart(slug, owner(req, res), storeId);
  res.status(201).json({ success: true, data });
}
