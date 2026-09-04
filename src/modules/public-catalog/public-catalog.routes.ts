import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import {
  publicBrands,
  publicCategories,
  publicCategory,
  publicCollection,
  publicCollections,
  publicHome,
  publicProduct,
  publicProducts,
  publicStores,
  publicSuggestions,
} from "./public-catalog.controller.js";

export const publicCatalogRouter = Router();

publicCatalogRouter.get("/home", asyncHandler(publicHome));
publicCatalogRouter.get("/stores", asyncHandler(publicStores));
publicCatalogRouter.get("/categories", asyncHandler(publicCategories));
publicCatalogRouter.get("/categories/:slug", asyncHandler(publicCategory));
publicCatalogRouter.get("/collections", asyncHandler(publicCollections));
publicCatalogRouter.get("/collections/:slug", asyncHandler(publicCollection));
publicCatalogRouter.get("/brands", asyncHandler(publicBrands));
publicCatalogRouter.get("/search/suggestions", asyncHandler(publicSuggestions));
publicCatalogRouter.get("/products", asyncHandler(publicProducts));
publicCatalogRouter.get("/products/:slug", asyncHandler(publicProduct));
