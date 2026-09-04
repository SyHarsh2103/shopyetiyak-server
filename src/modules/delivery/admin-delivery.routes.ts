import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  adminDeliverySlots,
  adminDeliveryZones,
  createDeliverySlotRecord,
  createDeliveryZoneRecord,
  deliveryOrders,
  markDelivered,
  markOutForDelivery,
  updateDeliverySlotRecord,
  updateDeliveryZoneRecord,
} from "./delivery.controller.js";

export const adminDeliveryRouter = Router();
adminDeliveryRouter.use(requireAdminAuth);
adminDeliveryRouter.get("/zones", requirePermission("delivery.read"), asyncHandler(adminDeliveryZones));
adminDeliveryRouter.post("/zones", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(createDeliveryZoneRecord));
adminDeliveryRouter.patch("/zones/:id", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(updateDeliveryZoneRecord));
adminDeliveryRouter.get("/slots", requirePermission("delivery.read"), asyncHandler(adminDeliverySlots));
adminDeliveryRouter.post("/slots", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(createDeliverySlotRecord));
adminDeliveryRouter.patch("/slots/:id", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(updateDeliverySlotRecord));
adminDeliveryRouter.get("/orders", requirePermission("delivery.read"), asyncHandler(deliveryOrders));
adminDeliveryRouter.post("/orders/:orderId/out-for-delivery", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(markOutForDelivery));
adminDeliveryRouter.post("/orders/:orderId/delivered", requireCsrf("admin"), requirePermission("delivery.manage"), asyncHandler(markDelivered));
