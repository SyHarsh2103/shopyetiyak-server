import { Types } from "mongoose";
import type { z } from "zod";

import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { SupplierModel } from "./supplier.model.js";
import { SupplierProductModel } from "./supplier-product.model.js";
import type {
  createSupplierSchema,
  supplierListQuerySchema,
  supplierProductListQuerySchema,
  updateSupplierSchema,
  upsertSupplierProductSchema,
} from "./supplier.validation.js";

type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
type SupplierProductListQuery = z.infer<typeof supplierProductListQuerySchema>;
type UpsertSupplierProductInput = z.infer<typeof upsertSupplierProductSchema>;

function escapedRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function assertSupplier(supplierId: string): Promise<void> {
  if (!await SupplierModel.exists({ _id: supplierId })) {
    throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
  }
}

async function assertProductVariant(productId: string, variantId: string): Promise<void> {
  if (!await ProductModel.exists({ _id: productId, archivedAt: null, "variants._id": variantId })) {
    throw new ApiError(404, "PRODUCT_VARIANT_NOT_FOUND", "The selected product variant does not exist or is archived.");
  }
}

export async function listSuppliers(query: SupplierListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = escapedRegex(query.search);
    filter.$or = [
      { companyName: regex },
      { contactPerson: regex },
      { email: regex },
      { phone: regex },
    ];
  }
  const skip = (query.page - 1) * query.limit;
  const [suppliers, total] = await Promise.all([
    SupplierModel.find(filter).sort({ companyName: 1 }).skip(skip).limit(query.limit).lean(),
    SupplierModel.countDocuments(filter),
  ]);
  return {
    items: suppliers,
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function getSupplier(id: string) {
  const supplier = await SupplierModel.findById(id).lean();
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
  return supplier;
}

export async function createSupplier(input: CreateSupplierInput) {
  return SupplierModel.create(input);
}

export async function updateSupplier(id: string, input: UpdateSupplierInput) {
  const supplier = await SupplierModel.findByIdAndUpdate(
    id,
    { $set: input },
    { returnDocument: "after", runValidators: true },
  );
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
  return supplier;
}

export async function listSupplierProducts(query: SupplierProductListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
  if (query.productId) filter.productId = new Types.ObjectId(query.productId);
  if (query.active !== undefined) filter.isActive = query.active === "true";

  if (query.search) {
    const regex = escapedRegex(query.search);
    const products = await ProductModel.find({
      $or: [{ name: regex }, { slug: regex }, { "variants.sku": regex }],
    }).select({ _id: 1 }).lean();
    filter.$or = [
      { supplierSku: regex },
      { supplierProductName: regex },
      { productId: { $in: products.map((product) => product._id) } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    SupplierProductModel.find(filter).sort({ isPreferred: -1, updatedAt: -1 }).skip(skip).limit(query.limit).lean(),
    SupplierProductModel.countDocuments(filter),
  ]);

  const supplierIds = [...new Set(records.map((record) => record.supplierId.toString()))];
  const productIds = [...new Set(records.map((record) => record.productId.toString()))];
  const [suppliers, products] = await Promise.all([
    SupplierModel.find({ _id: { $in: supplierIds } }).select({ companyName: 1, status: 1 }).lean(),
    ProductModel.find({ _id: { $in: productIds } }).select({ name: 1, variants: 1 }).lean(),
  ]);
  const supplierMap = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  return {
    items: records.map((record) => {
      const product = productMap.get(record.productId.toString());
      const variant = product?.variants.find((entry) => entry._id.toString() === record.variantId.toString());
      return {
        ...record,
        supplier: supplierMap.get(record.supplierId.toString()) ?? null,
        product: product ? { _id: product._id, name: product.name } : null,
        variant: variant ? { _id: variant._id, sku: variant.sku, sellingUnit: variant.sellingUnit, unitQuantity: variant.unitQuantity } : null,
      };
    }),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function upsertSupplierProduct(input: UpsertSupplierProductInput) {
  await assertSupplier(input.supplierId);
  await assertProductVariant(input.productId, input.variantId);

  if (input.isPreferred && input.isActive) {
    await SupplierProductModel.updateMany(
      {
        productId: new Types.ObjectId(input.productId),
        variantId: new Types.ObjectId(input.variantId),
        supplierId: { $ne: new Types.ObjectId(input.supplierId) },
        isPreferred: true,
      },
      { $set: { isPreferred: false } },
    );
  }

  const record = await SupplierProductModel.findOneAndUpdate(
    {
      supplierId: new Types.ObjectId(input.supplierId),
      productId: new Types.ObjectId(input.productId),
      variantId: new Types.ObjectId(input.variantId),
    },
    { $set: input },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true },
  );
  if (!record) throw new Error("Supplier product mapping was not saved.");
  return record;
}
