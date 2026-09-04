import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  advanceDeliveryOrder,
  createDeliverySlot,
  createDeliveryZone,
  listDeliveryOrders,
  listDeliverySlots,
  listDeliveryZones,
  listPublicDeliverySlots,
  resolveDeliveryZone,
  updateDeliverySlot,
  updateDeliveryZone,
} from "./delivery.service.js";
import {
  deliveryEligibilityQuerySchema,
  deliveryIdParamSchema,
  deliveryOrderNoteSchema,
  deliveryOrderParamSchema,
  deliverySlotInputSchema,
  deliverySlotListQuerySchema,
  deliverySlotUpdateSchema,
  deliveryZoneInputSchema,
  deliveryZoneListQuerySchema,
  deliveryZoneUpdateSchema,
  publicDeliverySlotQuerySchema,
} from "./delivery.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

function actor(req: Request) {
  const identity = admin(req);
  return { adminUserId: identity.adminUserId, roleNames: identity.roleNames };
}

export async function deliveryEligibility(req: Request, res: Response): Promise<void> {
  const query = deliveryEligibilityQuerySchema.parse(req.query);
  const zone = await resolveDeliveryZone(query.storeId, query.postalCode);
  res.status(200).json({
    success: true,
    data: {
      eligible: true,
      zone: {
        id: zone._id.toString(),
        name: zone.name,
        minimumOrderMinor: zone.minimumOrderMinor,
        deliveryFeeMinor: zone.deliveryFeeMinor,
        freeDeliveryThresholdMinor: zone.freeDeliveryThresholdMinor ?? null,
      },
    },
  });
}

export async function publicDeliverySlots(req: Request, res: Response): Promise<void> {
  const query = publicDeliverySlotQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPublicDeliverySlots(query.storeId, query.postalCode, query.date) });
}

export async function adminDeliveryZones(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = deliveryZoneListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { zones: await listDeliveryZones(query) } });
}

export async function createDeliveryZoneRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = deliveryZoneInputSchema.parse(req.body);
  const zone = await createDeliveryZone(input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "DELIVERY_ZONE_CREATED",
    entityType: "DeliveryZone",
    entityId: zone.id,
    after: input,
    request: req,
  });
  res.status(201).json({ success: true, data: { zone } });
}

export async function updateDeliveryZoneRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = deliveryIdParamSchema.parse(req.params);
  const input = deliveryZoneUpdateSchema.parse(req.body);
  const zone = await updateDeliveryZone(id, input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "DELIVERY_ZONE_UPDATED",
    entityType: "DeliveryZone",
    entityId: id,
    after: input,
    request: req,
  });
  res.status(200).json({ success: true, data: { zone } });
}

export async function adminDeliverySlots(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = deliverySlotListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: { slots: await listDeliverySlots(query) } });
}

export async function createDeliverySlotRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = deliverySlotInputSchema.parse(req.body);
  const slot = await createDeliverySlot(input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "DELIVERY_SLOT_CREATED",
    entityType: "DeliverySlot",
    entityId: slot.id,
    after: input,
    request: req,
  });
  res.status(201).json({ success: true, data: { slot } });
}

export async function updateDeliverySlotRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { id } = deliveryIdParamSchema.parse(req.params);
  const input = deliverySlotUpdateSchema.parse(req.body);
  const slot = await updateDeliverySlot(id, input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "DELIVERY_SLOT_UPDATED",
    entityType: "DeliverySlot",
    entityId: id,
    after: input,
    request: req,
  });
  res.status(200).json({ success: true, data: { slot } });
}

export async function deliveryOrders(req: Request, res: Response): Promise<void> {
  admin(req);
  res.status(200).json({ success: true, data: { orders: await listDeliveryOrders() } });
}

async function advance(req: Request, res: Response, action: "OUT_FOR_DELIVERY" | "DELIVERED") {
  const identity = admin(req);
  const { orderId } = deliveryOrderParamSchema.parse(req.params);
  const input = deliveryOrderNoteSchema.parse(req.body);
  const order = await advanceDeliveryOrder(orderId, action, actor(req), input.note);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: action === "DELIVERED" ? "ORDER_DELIVERED" : "ORDER_OUT_FOR_DELIVERY",
    entityType: "Order",
    entityId: orderId,
    after: { orderStatus: action, note: input.note },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}

export async function markOutForDelivery(req: Request, res: Response): Promise<void> {
  await advance(req, res, "OUT_FOR_DELIVERY");
}

export async function markDelivered(req: Request, res: Response): Promise<void> {
  await advance(req, res, "DELIVERED");
}
