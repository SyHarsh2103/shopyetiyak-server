import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { resolveSlug, escapeRegExp, activeFilter } from "../catalog/catalog.helpers.js";
import { CollectionModel } from "./collection.model.js";
import type { z } from "zod";
import type { createCollectionSchema, updateCollectionSchema } from "./collection.validation.js";

type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

export async function listCollections(search?: string, active?: "true" | "false") {
  const filter: Record<string, unknown> = {};
  const activeValue = activeFilter(active);
  if (activeValue !== undefined) filter.isActive = activeValue;
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }
  return CollectionModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCollection(id: string) {
  const collection = await CollectionModel.findById(id).lean();
  if (!collection) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
  return collection;
}

export async function createCollection(input: CreateCollectionInput) {
  const slug = resolveSlug(input.name, input.slug);
  if (await CollectionModel.exists({ slug })) throw new ApiError(409, "COLLECTION_SLUG_EXISTS", "A collection with this slug already exists.");
  return CollectionModel.create({ ...input, slug });
}

export async function updateCollection(id: string, input: UpdateCollectionInput) {
  const current = await CollectionModel.findById(id);
  if (!current) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
  const slug = input.slug !== undefined || input.name !== undefined
    ? resolveSlug(input.name ?? current.name, input.slug ?? current.slug)
    : current.slug;
  if (slug !== current.slug && await CollectionModel.exists({ slug, _id: { $ne: current._id } })) {
    throw new ApiError(409, "COLLECTION_SLUG_EXISTS", "A collection with this slug already exists.");
  }
  current.set({ ...input, slug });
  await current.save();
  return current;
}

export async function deleteCollection(id: string) {
  const collection = await CollectionModel.findById(id);
  if (!collection) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
  if (await ProductModel.exists({ collectionIds: collection._id })) {
    throw new ApiError(409, "COLLECTION_IN_USE", "This collection is assigned to one or more products and cannot be deleted.");
  }
  await collection.deleteOne();
  return collection;
}
