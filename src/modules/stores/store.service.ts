import { Types } from "mongoose";
import type { z } from "zod";
import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import type {
  createStoreSchema,
  storeProductListQuerySchema,
  updateStoreSchema,
  upsertStoreProductSchema,
} from "./store.validation.js";
import { StoreLocationModel } from "./store-location.model.js";
import { StoreProductModel } from "./store-product.model.js";

type CreateStoreInput = z.infer<typeof createStoreSchema>;
type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
type UpsertStoreProductInput = z.infer<typeof upsertStoreProductSchema>;
type StoreProductListQuery = z.infer<typeof storeProductListQuerySchema>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listStores(search?: string, status?: "ACTIVE" | "INACTIVE") {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [
      { name: regex },
      { code: regex },
      { "address.city": regex },
      { "address.state": regex },
      { "address.postalCode": regex },
    ];
  }
  return StoreLocationModel.find(filter).sort({ name: 1 }).lean();
}

export async function getStore(id: string) {
  const store = await StoreLocationModel.findById(id).lean();
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store location not found.");
  return store;
}

export async function createStore(input: CreateStoreInput) {
  if (await StoreLocationModel.exists({ code: input.code })) {
    throw new ApiError(409, "STORE_CODE_EXISTS", "A store with this code already exists.");
  }
  return StoreLocationModel.create(input);
}

export async function updateStore(id: string, input: UpdateStoreInput) {
  const store = await StoreLocationModel.findById(id);
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store location not found.");
  if (input.code && input.code !== store.code && await StoreLocationModel.exists({ code: input.code, _id: { $ne: store._id } })) {
    throw new ApiError(409, "STORE_CODE_EXISTS", "A store with this code already exists.");
  }
  store.set(input);
  await store.save();
  return store;
}

export async function listStoreProducts(query: StoreProductListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.productId) filter.productId = new Types.ObjectId(query.productId);
  if (query.available !== undefined) filter.isAvailable = query.available === "true";

  const records = await StoreProductModel.find(filter).sort({ updatedAt: -1 }).lean();
  if (records.length === 0) return [];

  const storeIds = [...new Set(records.map((record) => record.storeId.toString()))];
  const productIds = [...new Set(records.map((record) => record.productId.toString()))];
  const [stores, products] = await Promise.all([
    StoreLocationModel.find({ _id: { $in: storeIds } }).select({ name: 1, code: 1 }).lean(),
    ProductModel.find({ _id: { $in: productIds } }).select({ name: 1, slug: 1, isActive: 1 }).lean(),
  ]);
  const storeMap = new Map(stores.map((store) => [store._id.toString(), store]));
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  return records.map((record) => ({
    ...record,
    store: storeMap.get(record.storeId.toString()) ?? null,
    product: productMap.get(record.productId.toString()) ?? null,
  }));
}

export async function upsertStoreProduct(input: UpsertStoreProductInput) {
  const [store, product] = await Promise.all([
    StoreLocationModel.findById(input.storeId).lean(),
    ProductModel.findById(input.productId).lean(),
  ]);
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store location not found.");
  if (!product || product.archivedAt) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");

  return StoreProductModel.findOneAndUpdate(
    { storeId: new Types.ObjectId(input.storeId), productId: new Types.ObjectId(input.productId) },
    { $set: input },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}
