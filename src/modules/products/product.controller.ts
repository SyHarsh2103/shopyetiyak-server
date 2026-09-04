import type { Request, Response } from "express";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../audit/audit.service.js";
import { idParamSchema, paginatedCatalogQuerySchema } from "../catalog/catalog.validation.js";
import { archiveProduct, createProduct, deleteUnattachedProductImage, getProduct, listProducts, saveProductImage, updateProduct } from "./product.service.js";
import { createProductSchema, deleteProductImageSchema, productImageMetadataSchema, updateProductSchema } from "./product.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listProductRecords(req: Request, res: Response): Promise<void> {
  const query = paginatedCatalogQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listProducts(query) });
}

export async function getProductRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { product: await getProduct(id) } });
}

export async function createProductRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const product = await createProduct(createProductSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "PRODUCT_CREATE", entityType: "Product", entityId: product.id, after: product.toObject(), request: req });
  res.status(201).json({ success: true, data: { product } });
}

export async function updateProductRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getProduct(id);
  const product = await updateProduct(id, updateProductSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "PRODUCT_UPDATE", entityType: "Product", entityId: id, before, after: product.toObject(), request: req });
  res.status(200).json({ success: true, data: { product } });
}

export async function archiveProductRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getProduct(id);
  const product = await archiveProduct(id);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "PRODUCT_ARCHIVE", entityType: "Product", entityId: id, before, after: product.toObject(), request: req });
  res.status(200).json({ success: true, data: { archived: true } });
}

export async function uploadProductImageRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  if (!req.file) throw new ApiError(400, "IMAGE_REQUIRED", "Select an image to upload.");
  const metadata = productImageMetadataSchema.parse(req.body);
  const image = await saveProductImage(req.file, metadata.altText);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "PRODUCT_IMAGE_UPLOAD", entityType: "ProductImage", entityId: image.storageKey, after: image, request: req });
  res.status(201).json({ success: true, data: { image } });
}

export async function deleteProductImageRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { storageKey } = deleteProductImageSchema.parse(req.body);
  await deleteUnattachedProductImage(storageKey);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "PRODUCT_IMAGE_DELETE", entityType: "ProductImage", entityId: storageKey, request: req });
  res.status(200).json({ success: true, data: { deleted: true } });
}
