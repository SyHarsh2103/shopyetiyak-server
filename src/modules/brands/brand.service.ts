import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { resolveSlug, escapeRegExp, activeFilter } from "../catalog/catalog.helpers.js";
import { BrandModel } from "./brand.model.js";
import type { z } from "zod";
import type { createBrandSchema, updateBrandSchema } from "./brand.validation.js";

type CreateBrandInput = z.infer<typeof createBrandSchema>;
type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export async function listBrands(search?: string, active?: "true" | "false") {
  const filter: Record<string, unknown> = {};
  const activeValue = activeFilter(active);
  if (activeValue !== undefined) filter.isActive = activeValue;
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }
  return BrandModel.find(filter).sort({ name: 1 }).lean();
}

export async function getBrand(id: string) {
  const brand = await BrandModel.findById(id).lean();
  if (!brand) throw new ApiError(404, "BRAND_NOT_FOUND", "Brand not found.");
  return brand;
}

export async function createBrand(input: CreateBrandInput) {
  const slug = resolveSlug(input.name, input.slug);
  if (await BrandModel.exists({ slug })) throw new ApiError(409, "BRAND_SLUG_EXISTS", "A brand with this slug already exists.");
  return BrandModel.create({ ...input, slug });
}

export async function updateBrand(id: string, input: UpdateBrandInput) {
  const current = await BrandModel.findById(id);
  if (!current) throw new ApiError(404, "BRAND_NOT_FOUND", "Brand not found.");
  const slug = input.slug !== undefined || input.name !== undefined
    ? resolveSlug(input.name ?? current.name, input.slug ?? current.slug)
    : current.slug;
  if (slug !== current.slug && await BrandModel.exists({ slug, _id: { $ne: current._id } })) {
    throw new ApiError(409, "BRAND_SLUG_EXISTS", "A brand with this slug already exists.");
  }
  current.set({ ...input, slug });
  await current.save();
  return current;
}

export async function deleteBrand(id: string) {
  const brand = await BrandModel.findById(id);
  if (!brand) throw new ApiError(404, "BRAND_NOT_FOUND", "Brand not found.");
  if (await ProductModel.exists({ brandId: brand._id })) {
    throw new ApiError(409, "BRAND_IN_USE", "This brand is assigned to one or more products and cannot be deleted.");
  }
  await brand.deleteOne();
  return brand;
}
