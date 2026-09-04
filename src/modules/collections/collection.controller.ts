import type { Request, Response } from "express";
import { writeAudit } from "../audit/audit.service.js";
import { catalogListQuerySchema, idParamSchema } from "../catalog/catalog.validation.js";
import { createCollection, deleteCollection, getCollection, listCollections, updateCollection } from "./collection.service.js";
import { createCollectionSchema, updateCollectionSchema } from "./collection.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

export async function listCollectionRecords(req: Request, res: Response): Promise<void> {
  const query = catalogListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { collections: await listCollections(query.search, query.active) } });
}

export async function getCollectionRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { collection: await getCollection(id) } });
}

export async function createCollectionRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const collection = await createCollection(createCollectionSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "COLLECTION_CREATE", entityType: "Collection", entityId: collection.id, after: collection.toObject(), request: req });
  res.status(201).json({ success: true, data: { collection } });
}

export async function updateCollectionRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getCollection(id);
  const collection = await updateCollection(id, updateCollectionSchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "COLLECTION_UPDATE", entityType: "Collection", entityId: id, before, after: collection.toObject(), request: req });
  res.status(200).json({ success: true, data: { collection } });
}

export async function deleteCollectionRecord(req: Request, res: Response): Promise<void> {
  const actor = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const collection = await deleteCollection(id);
  await writeAudit({ actorType: "ADMIN", actorId: actor.adminUserId, actorRoleNames: actor.roleNames, action: "COLLECTION_DELETE", entityType: "Collection", entityId: id, before: collection.toObject(), request: req });
  res.status(200).json({ success: true, data: { deleted: true } });
}
