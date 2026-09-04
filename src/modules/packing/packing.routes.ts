import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  completePackingRecord,
  packingOrderDetail,
  packingOrders,
} from "./packing.controller.js";

export const packingRouter = Router();

packingRouter.use(requireAdminAuth);
packingRouter.get("/orders", requirePermission("fulfillment.packing.read"), asyncHandler(packingOrders));
packingRouter.get("/orders/:orderId", requirePermission("fulfillment.packing.read"), asyncHandler(packingOrderDetail));
packingRouter.post(
  "/orders/:orderId/complete",
  requireCsrf("admin"),
  requirePermission("fulfillment.packing.manage"),
  asyncHandler(completePackingRecord),
);
