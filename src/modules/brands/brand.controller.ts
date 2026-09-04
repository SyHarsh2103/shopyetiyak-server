import type { Request, Response } from "express";
import { writeAudit } from "../audit/audit.service.js";
import { catalogListQuerySchema, idParamSchema } from "../catalog/catalog.validation.js";
import { createBrand, deleteBrand, getBrand, listBrands, updateBrand } from "./brand.service.js";
import { createBrandSchema, updateBrandSchema } from "./brand.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listBrandRecords(req: Request, res: Response): Promise<void> {
  const query = catalogListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { brands: await listBrands(query.search, query.active) } });
}

export async function getBrandRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { brand: await getBrand(id) } });
}

export async function createBrandRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const brand = await createBrand(createBrandSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "BRAND_CREATE", entityType: "Brand", entityId: brand.id, after: brand.toObject(), request: req });
  res.status(201).json({ success: true, data: { brand } });
}

export async function updateBrandRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getBrand(id);
  const brand = await updateBrand(id, updateBrandSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "BRAND_UPDATE", entityType: "Brand", entityId: id, before, after: brand.toObject(), request: req });
  res.status(200).json({ success: true, data: { brand } });
}

export async function deleteBrandRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const brand = await deleteBrand(id);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "BRAND_DELETE", entityType: "Brand", entityId: id, before: brand.toObject(), request: req });
  res.status(200).json({ success: true, data: { deleted: true } });
}
