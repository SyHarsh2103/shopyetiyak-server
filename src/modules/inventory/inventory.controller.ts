import type { Request, Response } from "express";
import { idParamSchema } from "../catalog/catalog.validation.js";
import { writeAudit } from "../audit/audit.service.js";
import {
  adjustInventory,
  commitInventory,
  listBatches,
  listInventory,
  listTransactions,
  receiveBatch,
  releaseInventory,
  reserveInventory,
  transferInventory,
  updateReorderPolicy,
} from "./inventory.service.js";
import {
  batchListQuerySchema,
  inventoryAdjustmentSchema,
  inventoryListQuerySchema,
  inventoryReservationSchema,
  inventoryTransferSchema,
  receiveBatchSchema,
  transactionListQuerySchema,
  updateReorderPolicySchema,
} from "./inventory.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

function actor(req: Request) {
  const identity = admin(req);
  return { adminUserId: identity.adminUserId, roleNames: identity.roleNames };
}

export async function listInventoryRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listInventory(inventoryListQuerySchema.parse(req.query)) });
}

export async function updateReorderPolicyRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const inventory = await updateReorderPolicy(id, updateReorderPolicySchema.parse(req.body));
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "INVENTORY_REORDER_POLICY_UPDATE", entityType: "Inventory", entityId: id, after: inventory.toObject(), request: req });
  res.status(200).json({ success: true, data: { inventory } });
}

export async function receiveBatchRecord(req: Request, res: Response): Promise<void> {
  const input = receiveBatchSchema.parse(req.body);
  const result = await receiveBatch(input, actor(req));
  await writeAudit({ actorType: "ADMIN", actorId: admin(req).adminUserId, actorRoleNames: admin(req).roleNames, action: "INVENTORY_BATCH_RECEIVE", entityType: "InventoryBatch", entityId: result.batch.id, after: result.batch.toObject(), request: req });
  res.status(201).json({ success: true, data: result });
}

export async function adjustInventoryRecord(req: Request, res: Response): Promise<void> {
  const input = inventoryAdjustmentSchema.parse(req.body);
  const inventory = await adjustInventory(input, actor(req));
  const identity = admin(req);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "INVENTORY_ADJUST", entityType: "Inventory", entityId: inventory.id, after: inventory.toObject(), request: req });
  res.status(200).json({ success: true, data: { inventory } });
}

export async function reserveInventoryRecord(req: Request, res: Response): Promise<void> {
  const input = inventoryReservationSchema.parse(req.body);
  const inventory = await reserveInventory(input, actor(req));
  res.status(200).json({ success: true, data: { inventory } });
}

export async function releaseInventoryRecord(req: Request, res: Response): Promise<void> {
  const input = inventoryReservationSchema.parse(req.body);
  const inventory = await releaseInventory(input, actor(req));
  res.status(200).json({ success: true, data: { inventory } });
}

export async function commitInventoryRecord(req: Request, res: Response): Promise<void> {
  const input = inventoryReservationSchema.parse(req.body);
  const inventory = await commitInventory(input, actor(req));
  res.status(200).json({ success: true, data: { inventory } });
}

export async function transferInventoryRecord(req: Request, res: Response): Promise<void> {
  const input = inventoryTransferSchema.parse(req.body);
  const result = await transferInventory(input, actor(req));
  const identity = admin(req);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "INVENTORY_TRANSFER", entityType: "InventoryTransfer", entityId: result.transferId, after: { sourceStoreId: input.sourceStoreId, targetStoreId: input.targetStoreId, productId: input.productId, variantId: input.variantId, quantity: input.quantity }, request: req });
  res.status(201).json({ success: true, data: result });
}

export async function listBatchRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listBatches(batchListQuerySchema.parse(req.query)) });
}

export async function listTransactionRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listTransactions(transactionListQuerySchema.parse(req.query)) });
}
