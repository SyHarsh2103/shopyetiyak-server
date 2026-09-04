import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  adminCancelOrder,
  adminOrderDetail,
  adminOrders,
  adminRefundOrder,
  adminUpdateOrderStatus,
} from "./order.controller.js";

export const adminOrderRouter = Router();

adminOrderRouter.use(requireAdminAuth);
adminOrderRouter.get("/", requirePermission("orders.read"), asyncHandler(adminOrders));
adminOrderRouter.get("/:orderId", requirePermission("orders.read"), asyncHandler(adminOrderDetail));
adminOrderRouter.patch(
  "/:orderId/status",
  requireCsrf("admin"),
  requirePermission("orders.update"),
  asyncHandler(adminUpdateOrderStatus),
);
adminOrderRouter.post(
  "/:orderId/cancel",
  requireCsrf("admin"),
  requirePermission("orders.cancel"),
  asyncHandler(adminCancelOrder),
);
adminOrderRouter.post(
  "/:orderId/refunds",
  requireCsrf("admin"),
  requirePermission("payments.refund"),
  asyncHandler(adminRefundOrder),
);
