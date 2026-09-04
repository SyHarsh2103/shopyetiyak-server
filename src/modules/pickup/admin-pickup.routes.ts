import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { adminPickupSlots, createPickupSlotRecord, markPickedUp, pickupOrders, updatePickupSlotRecord } from "./pickup.controller.js";

export const adminPickupRouter = Router();
adminPickupRouter.use(requireAdminAuth);
adminPickupRouter.get("/slots", requirePermission("pickup.read"), asyncHandler(adminPickupSlots));
adminPickupRouter.post("/slots", requireCsrf("admin"), requirePermission("pickup.manage"), asyncHandler(createPickupSlotRecord));
adminPickupRouter.patch("/slots/:id", requireCsrf("admin"), requirePermission("pickup.manage"), asyncHandler(updatePickupSlotRecord));
adminPickupRouter.get("/orders", requirePermission("pickup.read"), asyncHandler(pickupOrders));
adminPickupRouter.post("/orders/:orderId/picked-up", requireCsrf("admin"), requirePermission("pickup.manage"), asyncHandler(markPickedUp));
