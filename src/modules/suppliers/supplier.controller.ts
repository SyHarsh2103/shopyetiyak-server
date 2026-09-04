import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { idParamSchema } from "../catalog/catalog.validation.js";
import {
  createSupplier,
  getSupplier,
  listSupplierProducts,
  listSuppliers,
  updateSupplier,
  upsertSupplierProduct,
} from "./supplier.service.js";
import {
  createSupplierSchema,
  supplierListQuerySchema,
  supplierProductListQuerySchema,
  updateSupplierSchema,
  upsertSupplierProductSchema,
} from "./supplier.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listSupplierRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listSuppliers(supplierListQuerySchema.parse(req.query)) });
}

export async function getSupplierRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { supplier: await getSupplier(id) } });
}

export async function createSupplierRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const supplier = await createSupplier(createSupplierSchema.parse(req.body));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "SUPPLIER_CREATE",
    entityType: "Supplier",
    entityId: supplier.id,
    after: supplier.toObject(),
    request: req,
  });
  res.status(201).json({ success: true, data: { supplier } });
}

export async function updateSupplierRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getSupplier(id);
  const supplier = await updateSupplier(id, updateSupplierSchema.parse(req.body));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "SUPPLIER_UPDATE",
    entityType: "Supplier",
    entityId: id,
    before,
    after: supplier.toObject(),
    request: req,
  });
  res.status(200).json({ success: true, data: { supplier } });
}

export async function listSupplierProductRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listSupplierProducts(supplierProductListQuerySchema.parse(req.query)) });
}

export async function upsertSupplierProductRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = upsertSupplierProductSchema.parse(req.body);
  const supplierProduct = await upsertSupplierProduct(input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "SUPPLIER_PRODUCT_UPSERT",
    entityType: "SupplierProduct",
    entityId: supplierProduct.id,
    after: supplierProduct.toObject(),
    request: req,
  });
  res.status(200).json({ success: true, data: { supplierProduct } });
}
