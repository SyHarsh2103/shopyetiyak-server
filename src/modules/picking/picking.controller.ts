import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  completePickingSchema,
  fulfillmentItemParamSchema,
  fulfillmentOrderParamSchema,
  markPickedSchema,
  markUnavailableSchema,
  pickingListQuerySchema,
  substituteItemSchema,
  substitutionCandidateQuerySchema,
} from "./picking.validation.js";
import {
  completePicking,
  getFulfillmentOrderDetail,
  listFefoBatches,
  listPickingOrders,
  listSubstitutionCandidates,
  markOrderItemPicked,
  markOrderItemUnavailable,
  startPicking,
  substituteOrderItem,
} from "./picking.service.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

function actor(req: Request) {
  const identity = admin(req);
  return {
    adminUserId: identity.adminUserId,
    roleNames: identity.roleNames,
  };
}

export async function pickingOrders(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = pickingListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPickingOrders(query) });
}

export async function pickingOrderDetail(req: Request, res: Response): Promise<void> {
  admin(req);
  const { orderId } = fulfillmentOrderParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { order: await getFulfillmentOrderDetail(orderId) } });
}

export async function startPickingRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = fulfillmentOrderParamSchema.parse(req.params);
  const before = await getFulfillmentOrderDetail(orderId);
  const order = await startPicking(orderId, actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_PICKING_STARTED",
    entityType: "Order",
    entityId: orderId,
    before: { orderStatus: before.orderStatus },
    after: { orderStatus: order.orderStatus },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}

export async function markPickedRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId, orderItemId } = fulfillmentItemParamSchema.parse(req.params);
  const input = markPickedSchema.parse(req.body);
  const order = await markOrderItemPicked(orderId, orderItemId, input, actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_ITEM_PICKED",
    entityType: "Order",
    entityId: orderId,
    after: { orderItemId, pickedQuantity: input.pickedQuantity, actualWeight: input.actualWeight, batchId: input.batchId },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}

export async function markUnavailableRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId, orderItemId } = fulfillmentItemParamSchema.parse(req.params);
  const input = markUnavailableSchema.parse(req.body);
  const order = await markOrderItemUnavailable(orderId, orderItemId, input, actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_ITEM_UNAVAILABLE",
    entityType: "Order",
    entityId: orderId,
    after: { orderItemId, reason: input.reason },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}

export async function substituteItemRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId, orderItemId } = fulfillmentItemParamSchema.parse(req.params);
  const input = substituteItemSchema.parse(req.body);
  const order = await substituteOrderItem(orderId, orderItemId, input, actor(req));
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_ITEM_SUBSTITUTED",
    entityType: "Order",
    entityId: orderId,
    after: {
      orderItemId,
      replacementProductId: input.replacementProductId,
      replacementVariantId: input.replacementVariantId,
      replacementQuantity: input.replacementQuantity,
      customerApproved: input.customerApproved,
      reason: input.reason,
    },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}

export async function substitutionCandidates(req: Request, res: Response): Promise<void> {
  admin(req);
  const { orderId, orderItemId } = fulfillmentItemParamSchema.parse(req.params);
  const query = substitutionCandidateQuerySchema.parse(req.query);
  res.status(200).json({
    success: true,
    data: { candidates: await listSubstitutionCandidates(orderId, orderItemId, query) },
  });
}

export async function fefoBatches(req: Request, res: Response): Promise<void> {
  admin(req);
  const { orderId, orderItemId } = fulfillmentItemParamSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: { batches: await listFefoBatches(orderId, orderItemId) },
  });
}

export async function completePickingRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = fulfillmentOrderParamSchema.parse(req.params);
  const input = completePickingSchema.parse(req.body);
  const order = await completePicking(orderId, actor(req), input.note);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_PICKING_COMPLETED",
    entityType: "Order",
    entityId: orderId,
    after: { orderStatus: order.orderStatus, fulfillmentPricing: order.fulfillmentPricing },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}
