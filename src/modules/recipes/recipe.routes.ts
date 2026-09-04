import { Router } from "express";

import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  getAdminRecipes,
  getMealKits,
  getRecipe,
  getRecipes,
  patchRecipe,
  postMealKitBundleToCart,
  postMealKitToCart,
  postRecipe,
  postRecipeIngredientsToCart,
} from "./recipe.controller.js";

export const recipeRouter = Router();
recipeRouter.use(optionalCustomerAuth);
recipeRouter.get("/", asyncHandler(getRecipes));
recipeRouter.get("/:slug", asyncHandler(getRecipe));
recipeRouter.post("/:slug/cart", requireCsrf("customer"), asyncHandler(postRecipeIngredientsToCart));
recipeRouter.post("/:slug/meal-kit/cart", requireCsrf("customer"), asyncHandler(postMealKitToCart));

export const adminRecipeRouter = Router();
adminRecipeRouter.use(requireAdminAuth);
adminRecipeRouter.get("/", requirePermission("content.read"), asyncHandler(getAdminRecipes));
adminRecipeRouter.post("/", requireCsrf("admin"), requirePermission("content.manage"), asyncHandler(postRecipe));
adminRecipeRouter.patch("/:id", requireCsrf("admin"), requirePermission("content.manage"), asyncHandler(patchRecipe));

export const mealKitRouter = Router();
mealKitRouter.use(optionalCustomerAuth);
mealKitRouter.get("/", asyncHandler(getMealKits));
mealKitRouter.post("/:slug/cart", requireCsrf("customer"), asyncHandler(postMealKitBundleToCart));
