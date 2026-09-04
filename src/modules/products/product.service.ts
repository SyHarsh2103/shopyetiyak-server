import { Types } from "mongoose";
import type { z } from "zod";
import { logger } from "../../config/logger.js";
import { storageProvider } from "../../storage/index.js";
import { ApiError } from "../../utils/api-error.js";
import { resolveSlug, escapeRegExp, activeFilter } from "../catalog/catalog.helpers.js";
import { BrandModel } from "../brands/brand.model.js";
import { CategoryModel } from "../categories/category.model.js";
import { CollectionModel } from "../collections/collection.model.js";
import { ProductModel } from "./product.model.js";
import { matchesImageSignature } from "./image-signature.js";
import type { createProductSchema, updateProductSchema } from "./product.validation.js";

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;

async function assertReferences(input: Pick<CreateProductInput, "brandId" | "categoryIds" | "collectionIds" | "relatedProductIds" | "frequentlyBoughtTogetherIds">, currentProductId?: string): Promise<void> {
  const categoryIds = [...new Set(input.categoryIds)];
  const collectionIds = [...new Set(input.collectionIds)];
  const relationIds = [...new Set([...input.relatedProductIds, ...input.frequentlyBoughtTogetherIds])];
  if (currentProductId && relationIds.includes(currentProductId)) {
    throw new ApiError(400, "PRODUCT_SELF_REFERENCE", "A product cannot reference itself as a related product.");
  }
  const [categoryCount, collectionCount, brandExists, relationCount] = await Promise.all([
    categoryIds.length ? CategoryModel.countDocuments({ _id: { $in: categoryIds } }) : 0,
    collectionIds.length ? CollectionModel.countDocuments({ _id: { $in: collectionIds } }) : 0,
    input.brandId ? BrandModel.exists({ _id: input.brandId }) : Promise.resolve(true),
    relationIds.length ? ProductModel.countDocuments({ _id: { $in: relationIds }, archivedAt: null }) : 0,
  ]);
  if (categoryCount !== categoryIds.length) throw new ApiError(400, "CATEGORY_REFERENCE_INVALID", "One or more selected categories do not exist.");
  if (collectionCount !== collectionIds.length) throw new ApiError(400, "COLLECTION_REFERENCE_INVALID", "One or more selected collections do not exist.");
  if (!brandExists) throw new ApiError(400, "BRAND_REFERENCE_INVALID", "The selected brand does not exist.");
  if (relationCount !== relationIds.length) throw new ApiError(400, "PRODUCT_REFERENCE_INVALID", "One or more related products do not exist.");
}

async function assertImagesExist(images: CreateProductInput["images"]): Promise<void> {
  for (const image of images) {
    if (!image.storageKey.startsWith("catalog/products/") || image.url !== `/uploads/${image.storageKey}`) {
      throw new ApiError(400, "PRODUCT_IMAGE_REFERENCE_INVALID", "A product image contains an invalid storage reference.");
    }
    if (!await storageProvider.exists(image.storageKey)) {
      throw new ApiError(400, "PRODUCT_IMAGE_MISSING", "One or more uploaded product images no longer exist in storage.");
    }
  }
}

async function assertUniqueVariantIdentifiers(variants: CreateProductInput["variants"], currentProductId?: string): Promise<void> {
  const fields = ["sku", "barcode", "upc", "ean"] as const;
  for (const field of fields) {
    const values = [...new Set(variants.map((variant) => variant[field]).filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase()))];
    if (!values.length) continue;
    const match = await ProductModel.findOne({
      ...(currentProductId ? { _id: { $ne: new Types.ObjectId(currentProductId) } } : {}),
      [`variants.${field}`]: { $in: values },
    }).select({ _id: 1, name: 1, [`variants.${field}`]: 1 }).lean();
    if (match) throw new ApiError(409, "PRODUCT_IDENTIFIER_EXISTS", `One or more ${field.toUpperCase()} values are already assigned to another product.`);
  }
}

function normalizeProductInput<T extends CreateProductInput | UpdateProductInput>(input: T): T {
  const copy = structuredClone(input);
  if ("categoryIds" in copy && copy.categoryIds) copy.categoryIds = [...new Set(copy.categoryIds)] as T["categoryIds"];
  if ("collectionIds" in copy && copy.collectionIds) copy.collectionIds = [...new Set(copy.collectionIds)] as T["collectionIds"];
  if ("relatedProductIds" in copy && copy.relatedProductIds) copy.relatedProductIds = [...new Set(copy.relatedProductIds)] as T["relatedProductIds"];
  if ("frequentlyBoughtTogetherIds" in copy && copy.frequentlyBoughtTogetherIds) copy.frequentlyBoughtTogetherIds = [...new Set(copy.frequentlyBoughtTogetherIds)] as T["frequentlyBoughtTogetherIds"];
  if ("tags" in copy && copy.tags) copy.tags = [...new Set(copy.tags.map((value) => value.trim()).filter(Boolean))] as T["tags"];
  if ("allergens" in copy && copy.allergens) copy.allergens = [...new Set(copy.allergens.map((value) => value.trim()).filter(Boolean))] as T["allergens"];
  if ("ingredients" in copy && copy.ingredients) copy.ingredients = [...new Set(copy.ingredients.map((value) => value.trim()).filter(Boolean))] as T["ingredients"];
  return copy;
}

export async function listProducts(query: { page: number; limit: number; search?: string; active?: "true" | "false" }) {
  const filter: Record<string, unknown> = { archivedAt: null };
  const activeValue = activeFilter(query.active);
  if (activeValue !== undefined) filter.isActive = activeValue;
  if (query.search) {
    const regex = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [
      { name: regex },
      { slug: regex },
      { tags: regex },
      { "variants.sku": regex },
      { "variants.barcode": regex },
      { "variants.upc": regex },
      { "variants.ean": regex },
    ];
  }
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    ProductModel.find(filter)
      .select({ name: 1, slug: 1, productType: 1, brandId: 1, categoryIds: 1, collectionIds: 1, images: 1, variants: 1, isActive: 1, isFeatured: 1, updatedAt: 1 })
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    ProductModel.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) } };
}

export async function getProduct(id: string) {
  const product = await ProductModel.findOne({ _id: id, archivedAt: null }).lean();
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return product;
}

export async function createProduct(input: CreateProductInput) {
  const normalized = normalizeProductInput(input);
  const slug = resolveSlug(normalized.name, normalized.slug);
  if (await ProductModel.exists({ slug })) throw new ApiError(409, "PRODUCT_SLUG_EXISTS", "A product with this slug already exists.");
  await Promise.all([
    assertReferences(normalized),
    assertUniqueVariantIdentifiers(normalized.variants),
    assertImagesExist(normalized.images),
  ]);
  return ProductModel.create({ ...normalized, slug, archivedAt: null });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const current = await ProductModel.findOne({ _id: id, archivedAt: null });
  if (!current) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const normalized = normalizeProductInput(input);
  const slug = input.slug !== undefined || input.name !== undefined
    ? resolveSlug(input.name ?? current.name, input.slug ?? current.slug)
    : current.slug;
  if (slug !== current.slug && await ProductModel.exists({ slug, _id: { $ne: current._id } })) {
    throw new ApiError(409, "PRODUCT_SLUG_EXISTS", "A product with this slug already exists.");
  }

  const referenceInput = {
    brandId: normalized.brandId !== undefined ? normalized.brandId : current.brandId?.toString() ?? null,
    categoryIds: normalized.categoryIds ?? current.categoryIds.map((value) => value.toString()),
    collectionIds: normalized.collectionIds ?? current.collectionIds.map((value) => value.toString()),
    relatedProductIds: normalized.relatedProductIds ?? current.relatedProductIds.map((value) => value.toString()),
    frequentlyBoughtTogetherIds: normalized.frequentlyBoughtTogetherIds ?? current.frequentlyBoughtTogetherIds.map((value) => value.toString()),
  };
  await assertReferences(referenceInput, id);
  if (normalized.variants) await assertUniqueVariantIdentifiers(normalized.variants, id);
  if (normalized.images) await assertImagesExist(normalized.images);

  const removedStorageKeys = normalized.images
    ? current.images.map((image) => image.storageKey).filter((key) => !normalized.images?.some((image) => image.storageKey === key))
    : [];
  current.set({ ...normalized, slug });
  await current.save();

  for (const storageKey of removedStorageKeys) {
    await storageProvider.delete(storageKey).catch((error: unknown) => {
      logger.warn({ err: error, storageKey, productId: id }, "Unable to remove detached product image from storage");
    });
  }
  return current;
}

export async function archiveProduct(id: string) {
  const product = await ProductModel.findOne({ _id: id, archivedAt: null });
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  product.isActive = false;
  product.archivedAt = new Date();
  await product.save();
  return product;
}

export async function saveProductImage(file: Express.Multer.File, altText: string) {
  if (!matchesImageSignature(file.buffer, file.mimetype)) {
    throw new ApiError(415, "IMAGE_CONTENT_INVALID", "The uploaded file content does not match its declared image type.");
  }
  const stored = await storageProvider.save({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    namespace: "catalog/products",
  });
  return { ...stored, altText, sortOrder: 0, isPrimary: false };
}

export async function deleteUnattachedProductImage(storageKey: string): Promise<void> {
  if (await ProductModel.exists({ "images.storageKey": storageKey })) {
    throw new ApiError(409, "PRODUCT_IMAGE_IN_USE", "This image is attached to a product and must be removed from that product first.");
  }
  await storageProvider.delete(storageKey);
}
