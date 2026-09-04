import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createPickupSlot,
  listPickupOrders,
  listPickupSlots,
  listPublicPickupSlots,
  markOrderPickedUp,
  updatePickupSlot,
} from "./pickup.service.js";
import {
  pickupIdParamSchema,
  pickupOrderNoteSchema,
  pickupOrderParamSchema,
  pickupSlotInputSchema,
  pickupSlotListQuerySchema,
  pickupSlotUpdateSchema,
  publicPickupSlotQuerySchema,
} from "./pickup.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

export async function publicPickupSlots(req: Request, res: Response): Promise<void> {
  const query = publicPickupSlotQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { slots: await listPublicPickupSlots(query.storeId, query.date) } });
}

export async function adminPickupSlots(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = pickupSlotListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { slots: await listPickupSlots(query) } });
}

export async function createPickupSlotRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = pickupSlotInputSchema.parse(req.body);
  const slot = await createPickupSlot(input);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "PICKUP_SLOT_CREATED", entityType: "PickupSlot", entityId: slot.id, after: input, request: req });
  res.status(201).json({ success: true, data: { slot } });
}

export async function updatePickupSlotRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = pickupIdParamSchema.parse(req.params);
  const input = pickupSlotUpdateSchema.parse(req.body);
  const slot = await updatePickupSlot(id, input);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "PICKUP_SLOT_UPDATED", entityType: "PickupSlot", entityId: id, after: input, request: req });
  res.status(200).json({ success: true, data: { slot } });
}

export async function pickupOrders(req: Request, res: Response): Promise<void> {
  admin(req);
  res.status(200).json({ success: true, data: { orders: await listPickupOrders() } });
}

export async function markPickedUp(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = pickupOrderParamSchema.parse(req.params);
  const input = pickupOrderNoteSchema.parse(req.body);
  const order = await markOrderPickedUp(orderId, { adminUserId: identity.adminUserId, roleNames: identity.roleNames }, input.note);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action: "ORDER_PICKED_UP", entityType: "Order", entityId: orderId, after: { orderStatus: "PICKED_UP", note: input.note }, request: req });
  res.status(200).json({ success: true, data: { order } });
}
