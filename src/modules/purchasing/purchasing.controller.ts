import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { idParamSchema } from "../catalog/catalog.validation.js";
import {
  createPurchaseOrder,
  createSupplierReturn,
  getPurchaseOrder,
  listGoodsReceipts,
  listPurchaseOrders,
  listSupplierReturns,
  receiveGoods,
  transitionPurchaseOrder,
  updatePurchaseOrder,
} from "./purchasing.service.js";
import {
  createPurchaseOrderSchema,
  goodsReceiptListQuerySchema,
  goodsReceiptSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderTransitionSchema,
  supplierReturnListQuerySchema,
  supplierReturnSchema,
  updatePurchaseOrderSchema,
} from "./purchasing.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new Error("Admin authentication middleware was not applied.");
  return req.auth;
}

function actor(req: Request) {
  const identity = admin(req);
  return { adminUserId: identity.adminUserId, roleNames: identity.roleNames };
}

export async function listPurchaseOrderRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listPurchaseOrders(purchaseOrderListQuerySchema.parse(req.query)) });
}

export async function getPurchaseOrderRecord(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { purchaseOrder: await getPurchaseOrder(id) } });
}

export async function createPurchaseOrderRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const purchaseOrder = await createPurchaseOrder(createPurchaseOrderSchema.parse(req.body), actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "PURCHASE_ORDER_CREATE",
    entityType: "PurchaseOrder",
    entityId: purchaseOrder.id,
    after: purchaseOrder.toObject(),
    request: req,
  });
  res.status(201).json({ success: true, data: { purchaseOrder } });
}

export async function updatePurchaseOrderRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getPurchaseOrder(id);
  const purchaseOrder = await updatePurchaseOrder(id, updatePurchaseOrderSchema.parse(req.body));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "PURCHASE_ORDER_UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    before,
    after: purchaseOrder.toObject(),
    request: req,
  });
  res.status(200).json({ success: true, data: { purchaseOrder } });
}

export async function transitionPurchaseOrderRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = idParamSchema.parse(req.params);
  const before = await getPurchaseOrder(id);
  const input = purchaseOrderTransitionSchema.parse(req.body);
  const purchaseOrder = await transitionPurchaseOrder(id, input, actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: `PURCHASE_ORDER_${input.status}`,
    entityType: "PurchaseOrder",
    entityId: id,
    before,
    after: purchaseOrder.toObject(),
    request: req,
  });
  res.status(200).json({ success: true, data: { purchaseOrder } });
}

export async function receiveGoodsRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const result = await receiveGoods(goodsReceiptSchema.parse(req.body), actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "GOODS_RECEIPT_CREATE",
    entityType: "GoodsReceipt",
    entityId: result.receipt.id,
    after: result.receipt.toObject(),
    request: req,
  });
  res.status(201).json({ success: true, data: result });
}

export async function listGoodsReceiptRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listGoodsReceipts(goodsReceiptListQuerySchema.parse(req.query)) });
}

export async function createSupplierReturnRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const supplierReturn = await createSupplierReturn(supplierReturnSchema.parse(req.body), actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "SUPPLIER_RETURN_CREATE",
    entityType: "SupplierReturn",
    entityId: supplierReturn.id,
    after: supplierReturn.toObject(),
    request: req,
  });
  res.status(201).json({ success: true, data: { supplierReturn } });
}

export async function listSupplierReturnRecords(req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listSupplierReturns(supplierReturnListQuerySchema.parse(req.query)) });
}
