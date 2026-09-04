import type { Request, Response } from "express";
import { writeAudit } from "../audit/audit.service.js";
import { catalogListQuerySchema, idParamSchema } from "../catalog/catalog.validation.js";
import { createCategorySchema, updateCategorySchema } from "./category.validation.js";
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from "./category.service.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listCategoryRecords(req: Request, res: Response): Promise<void> {
  const query = catalogListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { categories: await listCategories(query.search, query.active) } });
}

export async function getCategoryRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { category: await getCategory(id) } });
}

export async function createCategoryRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const category = await createCategory(createCategorySchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "CATEGORY_CREATE", entityType: "Category", entityId: category.id, after: category.toObject(), request: req });
  res.status(201).json({ success: true, data: { category } });
}

export async function updateCategoryRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getCategory(id);
  const category = await updateCategory(id, updateCategorySchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "CATEGORY_UPDATE", entityType: "Category", entityId: id, before, after: category.toObject(), request: req });
  res.status(200).json({ success: true, data: { category } });
}

export async function deleteCategoryRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const category = await deleteCategory(id);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "CATEGORY_DELETE", entityType: "Category", entityId: id, before: category.toObject(), request: req });
  res.status(200).json({ success: true, data: { deleted: true } });
}
