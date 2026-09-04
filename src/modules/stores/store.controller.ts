import type { Request, Response } from "express";
import { writeAudit } from "../audit/audit.service.js";
import { idParamSchema } from "../catalog/catalog.validation.js";
import {
  createStore,
  getStore,
  listStoreProducts,
  listStores,
  updateStore,
  upsertStoreProduct,
} from "./store.service.js";
import {
  createStoreSchema,
  storeListQuerySchema,
  storeProductListQuerySchema,
  updateStoreSchema,
  upsertStoreProductSchema,
} from "./store.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listStoreRecords(req: Request, res: Response): Promise<void> {
  const query = storeListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { stores: await listStores(query.search, query.status) } });
}

export async function getStoreRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { store: await getStore(id) } });
}

export async function createStoreRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const store = await createStore(createStoreSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "STORE_CREATE", entityType: "StoreLocation", entityId: store.id, after: store.toObject(), request: req });
  res.status(201).json({ success: true, data: { store } });
}

export async function updateStoreRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getStore(id);
  const store = await updateStore(id, updateStoreSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "STORE_UPDATE", entityType: "StoreLocation", entityId: id, before, after: store.toObject(), request: req });
  res.status(200).json({ success: true, data: { store } });
}

export async function listStoreProductRecords(req: Request, res: Response): Promise<void> {
  const query = storeProductListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { storeProducts: await listStoreProducts(query) } });
}

export async function upsertStoreProductRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const input = upsertStoreProductSchema.parse(req.body);
  const storeProduct = await upsertStoreProduct(input);
  if (!storeProduct) throw new Error("Store-product upsert did not return a record.");
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "STORE_PRODUCT_UPSERT", entityType: "StoreProduct", entityId: storeProduct.id, after: storeProduct.toObject(), request: req });
  res.status(200).json({ success: true, data: { storeProduct } });
}
