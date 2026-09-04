import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  completePickingRecord,
  fefoBatches,
  markPickedRecord,
  markUnavailableRecord,
  pickingOrderDetail,
  pickingOrders,
  startPickingRecord,
  substitutionCandidates,
  substituteItemRecord,
} from "./picking.controller.js";

export const pickingRouter = Router();

pickingRouter.use(requireAdminAuth);
pickingRouter.get("/orders", requirePermission("fulfillment.picking.read"), asyncHandler(pickingOrders));
pickingRouter.get("/orders/:orderId", requirePermission("fulfillment.picking.read"), asyncHandler(pickingOrderDetail));
pickingRouter.get(
  "/orders/:orderId/items/:orderItemId/batches",
  requirePermission("fulfillment.picking.read"),
  asyncHandler(fefoBatches),
);
pickingRouter.get(
  "/orders/:orderId/items/:orderItemId/substitution-candidates",
  requirePermission("fulfillment.picking.read"),
  asyncHandler(substitutionCandidates),
);
pickingRouter.post(
  "/orders/:orderId/start",
  requireCsrf("admin"),
  requirePermission("fulfillment.picking.manage"),
  asyncHandler(startPickingRecord),
);
pickingRouter.patch(
  "/orders/:orderId/items/:orderItemId/picked",
  requireCsrf("admin"),
  requirePermission("fulfillment.picking.manage"),
  asyncHandler(markPickedRecord),
);
pickingRouter.post(
  "/orders/:orderId/items/:orderItemId/unavailable",
  requireCsrf("admin"),
  requirePermission("fulfillment.picking.manage"),
  asyncHandler(markUnavailableRecord),
);
pickingRouter.post(
  "/orders/:orderId/items/:orderItemId/substitute",
  requireCsrf("admin"),
  requirePermission("fulfillment.picking.manage"),
  asyncHandler(substituteItemRecord),
);
pickingRouter.post(
  "/orders/:orderId/complete",
  requireCsrf("admin"),
  requirePermission("fulfillment.picking.manage"),
  asyncHandler(completePickingRecord),
);
