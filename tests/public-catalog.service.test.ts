import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BrandModel } from "../src/modules/brands/brand.model.js";
import { CategoryModel } from "../src/modules/categories/category.model.js";
import { CollectionModel } from "../src/modules/collections/collection.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import {
  getPublicProduct,
  listPublicProducts,
  searchSuggestions,
} from "../src/modules/public-catalog/public-catalog.service.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let mongo: MongoMemoryServer;
let storeId = "";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const root = await CategoryModel.create({ name: "Grocery", slug: "grocery", sortOrder: 0, isActive: true });
  const produce = await CategoryModel.create({ name: "Fresh Produce", slug: "fresh-produce", parentId: root._id, sortOrder: 10, isActive: true });
  const vegetables = await CategoryModel.create({ name: "Vegetables", slug: "vegetables", parentId: produce._id, sortOrder: 10, isActive: true });
  const brand = await BrandModel.create({ name: "Fresh Farm", slug: "fresh-farm", isActive: true });
  const collection = await CollectionModel.create({ name: "Weekly Deals", slug: "weekly-deals", isActive: true });
  const store = await StoreLocationModel.create({
    name: "Downtown Store",
    code: "DT1",
    address: { line1: "1 Market St", line2: "", city: "Jersey City", state: "NJ", postalCode: "07302", country: "USA" },
    timezone: "America/New_York",
    pickupEnabled: true,
    deliveryEnabled: true,
    status: "ACTIVE",
  });
  storeId = store.id;

  const product = await ProductModel.create({
    name: "Organic Tomatoes",
    slug: "organic-tomatoes",
    shortDescription: "Fresh red tomatoes",
    description: "Fresh organic tomatoes sold by the pound.",
    brandId: brand._id,
    categoryIds: [vegetables._id],
    collectionIds: [collection._id],
    productType: "VARIABLE_WEIGHT",
    countryOfOrigin: "USA",
    dietary: { vegetarian: true, vegan: true, glutenFree: true, halal: true, organic: true },
    tags: ["tomato", "fresh", "produce"],
    variants: [{
      sku: "TOMATO-LB",
      pricing: { currency: "USD", costPriceMinor: 150, regularPriceMinor: 399, salePriceMinor: 299 },
      sellingUnit: "POUND",
      unitQuantity: 1,
      minimumQuantity: 1,
      maximumQuantity: 10,
      quantityIncrement: 0.25,
      status: "ACTIVE",
    }],
    isActive: true,
    isFeatured: true,
    archivedAt: null,
  });
  const variant = product.variants[0];
  if (!variant) throw new Error("Test variant missing.");
  await InventoryModel.create({ storeId: store._id, productId: product._id, variantId: variant._id, quantityOnHand: 20, quantityReserved: 2, quantityAvailable: 18, reorderLevel: 5, reorderQuantity: 20 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("public catalog service", () => {
  it("finds nested-category products and exposes selected-store availability", async () => {
    const result = await listPublicProducts({ page: 1, limit: 24, category: "fresh-produce", storeId, inStock: true, organic: true, sort: "recommended" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("Organic Tomatoes");
    expect(result.items[0]?.availability.quantityAvailable).toBe(18);
    expect(result.items[0]?.price.minCurrentPriceMinor).toBe(299);
  });

  it("returns a product detail with variant-level stock", async () => {
    const result = await getPublicProduct("organic-tomatoes", storeId);
    expect(result.product.variants[0]?.availability).toEqual({ inStock: true, quantityAvailable: 18 });
    expect(result.product.brand?.name).toBe("Fresh Farm");
  });

  it("supports autocomplete from product search", async () => {
    const result = await searchSuggestions({ q: "tomato", storeId, limit: 8 });
    expect(result.products[0]?.slug).toBe("organic-tomatoes");
  });
});
