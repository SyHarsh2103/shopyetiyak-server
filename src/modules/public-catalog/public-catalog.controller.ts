import type { Request, Response } from "express";

import {
  getPublicCategory,
  getPublicCollection,
  getPublicHome,
  getPublicProduct,
  listPublicBrands,
  listPublicCategories,
  listPublicCollections,
  listPublicProducts,
  listPublicStores,
  searchSuggestions,
} from "./public-catalog.service.js";
import {
  publicCatalogListQuerySchema,
  publicCatalogSlugParamSchema,
  publicHomeQuerySchema,
  publicSearchSuggestionQuerySchema,
} from "./public-catalog.validation.js";

export async function publicStores(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: { stores: await listPublicStores() } });
}

export async function publicCategories(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: { categories: await listPublicCategories() } });
}

export async function publicCategory(req: Request, res: Response): Promise<void> {
  const { slug } = publicCatalogSlugParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { category: await getPublicCategory(slug) } });
}

export async function publicCollections(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: { collections: await listPublicCollections() } });
}

export async function publicCollection(req: Request, res: Response): Promise<void> {
  const { slug } = publicCatalogSlugParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { collection: await getPublicCollection(slug) } });
}

export async function publicBrands(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: { brands: await listPublicBrands() } });
}

export async function publicProducts(req: Request, res: Response): Promise<void> {
  const query = publicCatalogListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPublicProducts(query) });
}

export async function publicProduct(req: Request, res: Response): Promise<void> {
  const { slug } = publicCatalogSlugParamSchema.parse(req.params);
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
  res.status(200).json({ success: true, data: await getPublicProduct(slug, storeId) });
}

export async function publicSuggestions(req: Request, res: Response): Promise<void> {
  const query = publicSearchSuggestionQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await searchSuggestions(query) });
}

export async function publicHome(req: Request, res: Response): Promise<void> {
  const query = publicHomeQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await getPublicHome(query) });
}
