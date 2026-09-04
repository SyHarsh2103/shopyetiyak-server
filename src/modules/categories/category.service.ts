import { Types } from "mongoose";
import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { resolveSlug, escapeRegExp, activeFilter } from "../catalog/catalog.helpers.js";
import { CategoryModel } from "./category.model.js";
import type { z } from "zod";
import type { createCategorySchema, updateCategorySchema } from "./category.validation.js";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

async function assertParentAllowed(parentId: string | null | undefined, categoryId?: string): Promise<void> {
  if (!parentId) return;
  if (parentId === categoryId) throw new ApiError(400, "CATEGORY_PARENT_CYCLE", "A category cannot be its own parent.");
  let currentId: string | null = parentId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) throw new ApiError(409, "CATEGORY_TREE_INVALID", "The category tree contains a cycle.");
    visited.add(currentId);
    if (currentId === categoryId) throw new ApiError(400, "CATEGORY_PARENT_CYCLE", "The selected parent would create a category cycle.");
    const parentRecord = await CategoryModel.findById(currentId).select({ parentId: 1 }).lean() as { parentId?: { toString(): string } | null } | null;
    if (!parentRecord) throw new ApiError(404, "CATEGORY_PARENT_NOT_FOUND", "The selected parent category does not exist.");
    currentId = parentRecord.parentId ? parentRecord.parentId.toString() : null;
  }
}

export async function listCategories(search?: string, active?: "true" | "false") {
  const filter: Record<string, unknown> = {};
  const activeValue = activeFilter(active);
  if (activeValue !== undefined) filter.isActive = activeValue;
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }
  return CategoryModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCategory(id: string) {
  const category = await CategoryModel.findById(id).lean();
  if (!category) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  return category;
}

export async function createCategory(input: CreateCategoryInput) {
  await assertParentAllowed(input.parentId);
  const slug = resolveSlug(input.name, input.slug);
  if (await CategoryModel.exists({ slug })) throw new ApiError(409, "CATEGORY_SLUG_EXISTS", "A category with this slug already exists.");
  return CategoryModel.create({ ...input, slug });
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const current = await CategoryModel.findById(id);
  if (!current) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  if (input.parentId !== undefined) await assertParentAllowed(input.parentId, id);
  const slug = input.slug !== undefined || input.name !== undefined
    ? resolveSlug(input.name ?? current.name, input.slug ?? current.slug)
    : current.slug;
  if (slug !== current.slug && await CategoryModel.exists({ slug, _id: { $ne: current._id } })) {
    throw new ApiError(409, "CATEGORY_SLUG_EXISTS", "A category with this slug already exists.");
  }
  current.set({ ...input, slug });
  await current.save();
  return current;
}

export async function deleteCategory(id: string) {
  const categoryId = new Types.ObjectId(id);
  const [category, childExists, productExists] = await Promise.all([
    CategoryModel.findById(categoryId),
    CategoryModel.exists({ parentId: categoryId }),
    ProductModel.exists({ categoryIds: categoryId }),
  ]);
  if (!category) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  if (childExists) throw new ApiError(409, "CATEGORY_HAS_CHILDREN", "Move or remove child categories before deleting this category.");
  if (productExists) throw new ApiError(409, "CATEGORY_IN_USE", "This category is assigned to one or more products and cannot be deleted.");
  await category.deleteOne();
  return category;
}
