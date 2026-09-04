import type { Request, Response } from "express";
import { z } from "zod";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { fulfillmentOrderParamSchema } from "../picking/picking.validation.js";
import { completePackingSchema } from "./packing.validation.js";
import { getFulfillmentOrderDetail } from "../picking/picking.service.js";
import { listPackingOrders, packingService } from "./packing.service.js";

const packingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

export async function packingOrders(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = packingListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPackingOrders(query.page, query.limit) });
}

export async function packingOrderDetail(req: Request, res: Response): Promise<void> {
  admin(req);
  const { orderId } = fulfillmentOrderParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { order: await getFulfillmentOrderDetail(orderId) } });
}

export async function completePackingRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = fulfillmentOrderParamSchema.parse(req.params);
  const input = completePackingSchema.parse(req.body);
  const order = await packingService.completePacking(
    orderId,
    input,
    { adminUserId: identity.adminUserId, roleNames: identity.roleNames },
  );
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_PACKING_COMPLETED",
    entityType: "Order",
    entityId: orderId,
    after: {
      orderStatus: order.orderStatus,
      inventoryReservationStatus: order.inventoryReservationStatus,
      fulfillmentPricing: order.fulfillmentPricing,
      packing: order.packing,
    },
    request: req,
  });
  res.status(200).json({ success: true, data: { order } });
}
