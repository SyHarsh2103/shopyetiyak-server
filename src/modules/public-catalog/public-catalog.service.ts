import { type PipelineStage, Types } from "mongoose";

import { BrandModel } from "../brands/brand.model.js";
import { CategoryModel } from "../categories/category.model.js";
import { CollectionModel } from "../collections/collection.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { escapeRegExp } from "../catalog/catalog.helpers.js";
import type { z } from "zod";
import type {
  publicCatalogListQuerySchema,
  publicHomeQuerySchema,
  publicSearchSuggestionQuerySchema,
} from "./public-catalog.validation.js";

type PublicListQuery = z.infer<typeof publicCatalogListQuerySchema>;
type PublicHomeQuery = z.infer<typeof publicHomeQuerySchema>;
type SearchSuggestionQuery = z.infer<typeof publicSearchSuggestionQuerySchema>;

interface AggregatedProduct extends Record<string, unknown> {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  productType: string;
  brandId: Types.ObjectId | null;
  categoryIds: Types.ObjectId[];
  collectionIds: Types.ObjectId[];
  countryOfOrigin: string;
  images: Array<{
    storageKey: string;
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
    altText: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  dietary: {
    vegetarian: boolean;
    vegan: boolean;
    glutenFree: boolean;
    halal: boolean;
    organic: boolean;
  };
  tags: string[];
  variants: Array<{
    _id: Types.ObjectId;
    sku: string;
    barcode?: string;
    upc?: string;
    ean?: string;
    attributes: Array<{ name: string; value: string }>;
    pricing: {
      currency: string;
      costPriceMinor: number;
      regularPriceMinor: number;
      salePriceMinor: number | null;
    };
    sellingUnit: string;
    unitQuantity: number;
    minimumQuantity: number;
    maximumQuantity: number | null;
    quantityIncrement: number;
    status: string;
  }>;
  ingredients: string[];
  nutrition: Array<{ name: string; value: string }>;
  allergens: string[];
  storageInstructions: string;
  seo: { title: string; description: string; keywords: string[] };
  relatedProductIds: Types.ObjectId[];
  frequentlyBoughtTogetherIds: Types.ObjectId[];
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PublicStore {
  _id: string;
  name: string;
  code: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  email: string;
  timezone: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}

interface InventoryAvailability {
  variantId: string;
  quantityAvailable: number;
}

function currentPrice(variant: AggregatedProduct["variants"][number]): number {
  const sale = variant.pricing.salePriceMinor;
  return sale !== null && sale < variant.pricing.regularPriceMinor
    ? sale
    : variant.pricing.regularPriceMinor;
}

async function resolveStore(storeId?: string): Promise<PublicStore | null> {
  const filter: Record<string, unknown> = { status: "ACTIVE" };
  if (storeId && Types.ObjectId.isValid(storeId)) {
    filter._id = new Types.ObjectId(storeId);
  }

  const store = await StoreLocationModel.findOne(filter)
    .sort({ name: 1, _id: 1 })
    .lean();

  if (storeId && !store) {
    throw new ApiError(404, "STORE_NOT_FOUND", "The selected store is not available.");
  }

  if (!store) return null;

  return {
    _id: store._id.toString(),
    name: store.name,
    code: store.code,
    address: {
      line1: store.address.line1,
      line2: store.address.line2,
      city: store.address.city,
      state: store.address.state,
      postalCode: store.address.postalCode,
      country: store.address.country,
    },
    phone: store.phone,
    email: store.email,
    timezone: store.timezone,
    pickupEnabled: store.pickupEnabled,
    deliveryEnabled: store.deliveryEnabled,
  };
}

async function categoryIdsForSlug(slug: string): Promise<Types.ObjectId[]> {
  const categories = await CategoryModel.find({ isActive: true })
    .select({ _id: 1, slug: 1, parentId: 1 })
    .lean();
  const root = categories.find((category) => category.slug === slug);
  if (!root) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");

  const ids = new Set<string>([root._id.toString()]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId.toString()) && !ids.has(category._id.toString())) {
        ids.add(category._id.toString());
        changed = true;
      }
    }
  }
  return [...ids].map((id) => new Types.ObjectId(id));
}

async function buildProductMatch(query: PublicListQuery, store: PublicStore | null): Promise<Record<string, unknown>> {
  const match: Record<string, unknown> = {
    archivedAt: null,
    isActive: true,
    "variants.status": "ACTIVE",
  };

  if (query.category) match.categoryIds = { $in: await categoryIdsForSlug(query.category) };

  if (query.collection) {
    const collection = await CollectionModel.findOne({ slug: query.collection, isActive: true }).select({ _id: 1 }).lean();
    if (!collection) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
    match.collectionIds = collection._id;
  }

  if (query.brand) {
    const brand = await BrandModel.findOne({ slug: query.brand, isActive: true }).select({ _id: 1 }).lean();
    if (!brand) throw new ApiError(404, "BRAND_NOT_FOUND", "Brand not found.");
    match.brandId = brand._id;
  }

  if (query.vegetarian !== undefined) match["dietary.vegetarian"] = query.vegetarian;
  if (query.vegan !== undefined) match["dietary.vegan"] = query.vegan;
  if (query.glutenFree !== undefined) match["dietary.glutenFree"] = query.glutenFree;
  if (query.halal !== undefined) match["dietary.halal"] = query.halal;
  if (query.organic !== undefined) match["dietary.organic"] = query.organic;
  if (query.unit || query.size) {
    match.variants = {
      $elemMatch: {
        status: "ACTIVE",
        ...(query.unit ? { sellingUnit: query.unit } : {}),
        ...(query.size ? { attributes: { $elemMatch: { name: /^size$/i, value: new RegExp(`^${escapeRegExp(query.size)}$`, "i") } } } : {}),
      },
    };
  }

  if (query.country) {
    match.countryOfOrigin = new RegExp(`^${escapeRegExp(query.country)}$`, "i");
  }

  if (query.q) {
    const regex = new RegExp(escapeRegExp(query.q), "i");
    const [matchingBrands, matchingCategories] = await Promise.all([
      BrandModel.find({ isActive: true, name: regex }).select({ _id: 1 }).lean(),
      CategoryModel.find({ isActive: true, name: regex }).select({ _id: 1 }).lean(),
    ]);
    match.$or = [
      { name: regex },
      { slug: regex },
      { shortDescription: regex },
      { description: regex },
      { tags: regex },
      { "variants.sku": regex },
      { "variants.barcode": regex },
      { "variants.upc": regex },
      { "variants.ean": regex },
      { brandId: { $in: matchingBrands.map((brand) => brand._id) } },
      { categoryIds: { $in: matchingCategories.map((category) => category._id) } },
    ];
  }

  if (store) {
    const disabledProductIds = await StoreProductModel.distinct("productId", {
      storeId: new Types.ObjectId(store._id),
      isAvailable: false,
    });
    if (disabledProductIds.length) match._id = { $nin: disabledProductIds };

    if (query.inStock === true) {
      const stockedProductIds = await InventoryModel.distinct("productId", {
        storeId: new Types.ObjectId(store._id),
        quantityAvailable: { $gt: 0 },
      });
      match._id = {
        ...(typeof match._id === "object" && match._id !== null ? match._id : {}),
        $in: stockedProductIds,
      };
    }
  } else if (query.inStock === true) {
    match._id = { $in: [] };
  }

  return match;
}

function sortStage(sort: PublicListQuery["sort"]): Record<string, 1 | -1> {
  switch (sort) {
    case "newest":
      return { createdAt: -1, _id: -1 };
    case "best_selling":
      return { salesUnits: -1, isFeatured: -1, updatedAt: -1 };
    case "price_asc":
      return { minCurrentPriceMinor: 1, name: 1 };
    case "price_desc":
      return { minCurrentPriceMinor: -1, name: 1 };
    case "discount":
      return { maxDiscountMinor: -1, isFeatured: -1, updatedAt: -1 };
    case "recommended":
    default:
      return { isFeatured: -1, updatedAt: -1, _id: -1 };
  }
}

async function availabilityForProducts(
  productIds: Types.ObjectId[],
  store: PublicStore | null,
): Promise<Map<string, InventoryAvailability[]>> {
  const map = new Map<string, InventoryAvailability[]>();
  if (!store || productIds.length === 0) return map;

  const records = await InventoryModel.find({
    storeId: new Types.ObjectId(store._id),
    productId: { $in: productIds },
  }).select({ productId: 1, variantId: 1, quantityAvailable: 1 }).lean();

  for (const record of records) {
    const key = record.productId.toString();
    const current = map.get(key) ?? [];
    current.push({
      variantId: record.variantId.toString(),
      quantityAvailable: record.quantityAvailable,
    });
    map.set(key, current);
  }
  return map;
}

async function enrichmentMaps(products: AggregatedProduct[]) {
  const brandIds = [...new Set(products.flatMap((product) => product.brandId ? [product.brandId.toString()] : []))];
  const categoryIds = [...new Set(products.flatMap((product) => product.categoryIds.map((id) => id.toString())))];
  const collectionIds = [...new Set(products.flatMap((product) => product.collectionIds.map((id) => id.toString())))];

  const [brands, categories, collections] = await Promise.all([
    brandIds.length ? BrandModel.find({ _id: { $in: brandIds }, isActive: true }).select({ name: 1, slug: 1 }).lean() : [],
    categoryIds.length ? CategoryModel.find({ _id: { $in: categoryIds }, isActive: true }).select({ name: 1, slug: 1 }).lean() : [],
    collectionIds.length ? CollectionModel.find({ _id: { $in: collectionIds }, isActive: true }).select({ name: 1, slug: 1 }).lean() : [],
  ]);

  return {
    brands: new Map(brands.map((brand) => [brand._id.toString(), { _id: brand._id.toString(), name: brand.name, slug: brand.slug }])),
    categories: new Map(categories.map((category) => [category._id.toString(), { _id: category._id.toString(), name: category.name, slug: category.slug }])),
    collections: new Map(collections.map((collection) => [collection._id.toString(), { _id: collection._id.toString(), name: collection.name, slug: collection.slug }])),
  };
}

function serializeCard(
  product: AggregatedProduct,
  maps: Awaited<ReturnType<typeof enrichmentMaps>>,
  availability: InventoryAvailability[],
) {
  const activeVariants = product.variants.filter((variant) => variant.status === "ACTIVE");
  const totalAvailable = availability.reduce((sum, record) => sum + record.quantityAvailable, 0);
  const primaryImage = [...product.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)[0] ?? null;
  const prices = activeVariants.map(currentPrice);

  return {
    _id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    productType: product.productType,
    brand: product.brandId ? maps.brands.get(product.brandId.toString()) ?? null : null,
    categories: product.categoryIds.flatMap((id) => {
      const category = maps.categories.get(id.toString());
      return category ? [category] : [];
    }),
    primaryImage: primaryImage ? { url: primaryImage.url, altText: primaryImage.altText || product.name } : null,
    price: {
      currency: activeVariants[0]?.pricing.currency ?? "USD",
      minCurrentPriceMinor: prices.length ? Math.min(...prices) : 0,
      maxCurrentPriceMinor: prices.length ? Math.max(...prices) : 0,
      hasSale: activeVariants.some((variant) => variant.pricing.salePriceMinor !== null && variant.pricing.salePriceMinor < variant.pricing.regularPriceMinor),
    },
    availability: {
      inStock: totalAvailable > 0,
      quantityAvailable: totalAvailable,
    },
    isFeatured: product.isFeatured,
  };
}

export async function listPublicStores() {
  const stores = await StoreLocationModel.find({ status: "ACTIVE" }).sort({ name: 1 }).lean();
  return stores.map((store) => ({
    _id: store._id.toString(),
    name: store.name,
    code: store.code,
    address: store.address,
    phone: store.phone,
    email: store.email,
    timezone: store.timezone,
    pickupEnabled: store.pickupEnabled,
    deliveryEnabled: store.deliveryEnabled,
  }));
}

export async function listPublicCategories() {
  const categories = await CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  return categories.map((category) => ({
    _id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId?.toString() ?? null,
    sortOrder: category.sortOrder,
    seo: category.seo,
  }));
}

export async function getPublicCategory(slug: string) {
  const category = await CategoryModel.findOne({ slug, isActive: true }).lean();
  if (!category) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  return {
    _id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId?.toString() ?? null,
    sortOrder: category.sortOrder,
    seo: category.seo,
  };
}

export async function listPublicCollections() {
  const now = new Date();
  const collections = await CollectionModel.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).sort({ sortOrder: 1, name: 1 }).lean();
  return collections.map((collection) => ({
    _id: collection._id.toString(),
    name: collection.name,
    slug: collection.slug,
    description: collection.description,
    sortOrder: collection.sortOrder,
    seo: collection.seo,
  }));
}

export async function getPublicCollection(slug: string) {
  const now = new Date();
  const collection = await CollectionModel.findOne({
    slug,
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).lean();
  if (!collection) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
  return {
    _id: collection._id.toString(),
    name: collection.name,
    slug: collection.slug,
    description: collection.description,
    sortOrder: collection.sortOrder,
    seo: collection.seo,
  };
}

export async function listPublicBrands() {
  const brands = await BrandModel.find({ isActive: true }).sort({ name: 1 }).lean();
  return brands.map((brand) => ({
    _id: brand._id.toString(),
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    countryOfOrigin: brand.countryOfOrigin,
  }));
}

export async function listPublicProducts(query: PublicListQuery) {
  const store = await resolveStore(query.storeId);
  const match = await buildProductMatch(query, store);
  const priceMatch: Record<string, unknown> = {};
  if (query.minPriceMinor !== undefined) priceMatch.minCurrentPriceMinor = { $gte: query.minPriceMinor };
  if (query.maxPriceMinor !== undefined) priceMatch.minCurrentPriceMinor = {
    ...(typeof priceMatch.minCurrentPriceMinor === "object" && priceMatch.minCurrentPriceMinor !== null ? priceMatch.minCurrentPriceMinor : {}),
    $lte: query.maxPriceMinor,
  };
  if (query.discount === true) priceMatch.hasSale = true;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $set: {
        activeVariants: {
          $filter: {
            input: "$variants",
            as: "variant",
            cond: { $eq: ["$$variant.status", "ACTIVE"] },
          },
        },
      },
    },
    { $match: { "activeVariants.0": { $exists: true } } },
    {
      $set: {
        currentPrices: {
          $map: {
            input: "$activeVariants",
            as: "variant",
            in: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$$variant.pricing.salePriceMinor", null] },
                    { $lt: ["$$variant.pricing.salePriceMinor", "$$variant.pricing.regularPriceMinor"] },
                  ],
                },
                "$$variant.pricing.salePriceMinor",
                "$$variant.pricing.regularPriceMinor",
              ],
            },
          },
        },
        saleDiscounts: {
          $map: {
            input: "$activeVariants",
            as: "variant",
            in: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$$variant.pricing.salePriceMinor", null] },
                    { $lt: ["$$variant.pricing.salePriceMinor", "$$variant.pricing.regularPriceMinor"] },
                  ],
                },
                { $subtract: ["$$variant.pricing.regularPriceMinor", "$$variant.pricing.salePriceMinor"] },
                0,
              ],
            },
          },
        },
      },
    },
    {
      $set: {
        minCurrentPriceMinor: { $min: "$currentPrices" },
        maxCurrentPriceMinor: { $max: "$currentPrices" },
        maxDiscountMinor: { $max: "$saleDiscounts" },
        hasSale: { $gt: [{ $max: "$saleDiscounts" }, 0] },
      },
    },
    ...(Object.keys(priceMatch).length ? [{ $match: priceMatch }] : []),
    ...(query.sort === "best_selling" ? [
      {
        $lookup: {
          from: "orders",
          let: { productId: "$_id" },
          pipeline: [
            { $match: { orderStatus: { $in: ["READY", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP"] } } },
            { $unwind: "$items" },
            { $match: { $expr: { $eq: ["$items.productId", "$$productId"] } } },
            { $group: { _id: null, units: { $sum: { $ifNull: ["$items.pickedQuantity", "$items.requestedQuantity"] } } } },
          ],
          as: "salesSummary",
        },
      },
      { $set: { salesUnits: { $ifNull: [{ $first: "$salesSummary.units" }, 0] } } },
    ] : []),
    {
      $facet: {
        items: [
          { $sort: sortStage(query.sort) },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
        ],
        metadata: [{ $count: "total" }],
      },
    },
  ];

  const [result] = await ProductModel.aggregate<{
    items: AggregatedProduct[];
    metadata: Array<{ total: number }>;
  }>(pipeline);

  const products = result?.items ?? [];
  const total = result?.metadata[0]?.total ?? 0;
  const [maps, availability] = await Promise.all([
    enrichmentMaps(products),
    availabilityForProducts(products.map((product) => product._id), store),
  ]);

  return {
    store,
    items: products.map((product) => serializeCard(product, maps, availability.get(product._id.toString()) ?? [])),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getPublicProduct(slug: string, storeId?: string) {
  const store = await resolveStore(storeId);
  const product = await ProductModel.findOne({ slug, archivedAt: null, isActive: true, "variants.status": "ACTIVE" }).lean();
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");

  if (store) {
    const disabled = await StoreProductModel.exists({
      storeId: new Types.ObjectId(store._id),
      productId: product._id,
      isAvailable: false,
    });
    if (disabled) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  }

  const [maps, availability] = await Promise.all([
    enrichmentMaps([product as AggregatedProduct]),
    availabilityForProducts([product._id], store),
  ]);
  const variantAvailability = new Map((availability.get(product._id.toString()) ?? []).map((record) => [record.variantId, record.quantityAvailable]));
  const activeVariants = product.variants.filter((variant) => variant.status === "ACTIVE");

  const relationIds = [...new Set([
    ...product.relatedProductIds.map((id) => id.toString()),
    ...product.frequentlyBoughtTogetherIds.map((id) => id.toString()),
  ])].map((id) => new Types.ObjectId(id));
  const relationProducts = relationIds.length
    ? await ProductModel.find({ _id: { $in: relationIds }, archivedAt: null, isActive: true }).lean()
    : [];
  const relationMaps = await enrichmentMaps(relationProducts as AggregatedProduct[]);
  const relationAvailability = await availabilityForProducts(relationProducts.map((item) => item._id), store);
  const relationCards = new Map(relationProducts.map((item) => [
    item._id.toString(),
    serializeCard(item as AggregatedProduct, relationMaps, relationAvailability.get(item._id.toString()) ?? []),
  ]));

  return {
    store,
    product: {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      productType: product.productType,
      brand: product.brandId ? maps.brands.get(product.brandId.toString()) ?? null : null,
      categories: product.categoryIds.flatMap((id) => {
        const category = maps.categories.get(id.toString());
        return category ? [category] : [];
      }),
      collections: product.collectionIds.flatMap((id) => {
        const collection = maps.collections.get(id.toString());
        return collection ? [collection] : [];
      }),
      images: [...product.images]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
        .map((image) => ({ url: image.url, altText: image.altText || product.name, isPrimary: image.isPrimary })),
      variants: activeVariants.map((variant) => ({
        _id: variant._id.toString(),
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        upc: variant.upc ?? null,
        ean: variant.ean ?? null,
        attributes: variant.attributes,
        pricing: {
          currency: variant.pricing.currency,
          regularPriceMinor: variant.pricing.regularPriceMinor,
          salePriceMinor: variant.pricing.salePriceMinor,
        },
        sellingUnit: variant.sellingUnit,
        unitQuantity: variant.unitQuantity,
        minimumQuantity: variant.minimumQuantity,
        maximumQuantity: variant.maximumQuantity,
        quantityIncrement: variant.quantityIncrement,
        availability: {
          inStock: (variantAvailability.get(variant._id.toString()) ?? 0) > 0,
          quantityAvailable: variantAvailability.get(variant._id.toString()) ?? 0,
        },
      })),
      countryOfOrigin: product.countryOfOrigin,
      ingredients: product.ingredients,
      nutrition: product.nutrition,
      allergens: product.allergens,
      storageInstructions: product.storageInstructions,
      dietary: product.dietary,
      tags: product.tags,
      seo: product.seo,
      isFeatured: product.isFeatured,
      relatedProducts: product.relatedProductIds.flatMap((id) => {
        const card = relationCards.get(id.toString());
        return card ? [card] : [];
      }),
      frequentlyBoughtTogether: product.frequentlyBoughtTogetherIds.flatMap((id) => {
        const card = relationCards.get(id.toString());
        return card ? [card] : [];
      }),
    },
  };
}

export async function searchSuggestions(query: SearchSuggestionQuery) {
  const store = await resolveStore(query.storeId);
  const list = await listPublicProducts({
    page: 1,
    limit: query.limit,
    q: query.q,
    storeId: store?._id,
    sort: "recommended",
  });
  const categoryRegex = new RegExp(escapeRegExp(query.q), "i");
  const categories = await CategoryModel.find({ isActive: true, name: categoryRegex })
    .select({ name: 1, slug: 1 })
    .sort({ sortOrder: 1, name: 1 })
    .limit(4)
    .lean();
  return {
    products: list.items,
    categories: categories.map((category) => ({ _id: category._id.toString(), name: category.name, slug: category.slug })),
  };
}

export async function getPublicHome(query: PublicHomeQuery) {
  const [stores, categories, collections, brands] = await Promise.all([
    listPublicStores(),
    listPublicCategories(),
    listPublicCollections(),
    listPublicBrands(),
  ]);
  const storeId = query.storeId ?? stores[0]?._id;

  const rowDefinitions = [
    { key: "featuredProducts", featured: true as const },
    { key: "weeklyDeals", collection: "weekly-deals" },
    { key: "freshProduce", category: "fresh-produce" },
    { key: "bestSellers", sort: "best_selling" as const },
    { key: "readyToCook", category: "ready-to-cook" },
    { key: "asianFoods", category: "asian-foods" },
    { key: "organicHealthy", category: "organic-healthy" },
    { key: "festivalSpecials", collection: "festival-specials" },
    { key: "newArrivals" },
  ] as const;

  const rowEntries = await Promise.all(rowDefinitions.map(async (definition) => {
    try {
      const result = await listPublicProducts({
        page: 1,
        limit: 8,
        storeId,
        sort: "sort" in definition ? definition.sort : definition.key === "newArrivals" ? "newest" : "recommended",
        ...("category" in definition ? { category: definition.category } : {}),
        ...("collection" in definition ? { collection: definition.collection } : {}),
      });
      return { key: definition.key, items: "featured" in definition ? result.items.filter((item) => item.isFeatured) : result.items };
    } catch (error: unknown) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return { key: definition.key, items: [] };
      }
      throw error;
    }
  }));

  const rows: Record<(typeof rowDefinitions)[number]["key"], ReturnType<typeof serializeCard>[]> = {
    featuredProducts: [],
    weeklyDeals: [],
    freshProduce: [],
    bestSellers: [],
    readyToCook: [],
    asianFoods: [],
    organicHealthy: [],
    festivalSpecials: [],
    newArrivals: [],
  };
  for (const entry of rowEntries) rows[entry.key] = entry.items;

  return {
    store: storeId ? await resolveStore(storeId) : null,
    stores,
    categories,
    collections,
    brands: brands.slice(0, 12),
    rows,
  };
}
