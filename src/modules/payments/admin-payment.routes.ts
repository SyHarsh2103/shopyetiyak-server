import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  cancelPaymentRecord,
  capturePaymentRecord,
  refundPaymentRecord,
} from "./payment.controller.js";

export const adminPaymentRouter = Router();

adminPaymentRouter.use(requireAdminAuth);
adminPaymentRouter.post(
  "/:paymentId/capture",
  requireCsrf("admin"),
  requirePermission("payments.capture"),
  asyncHandler(capturePaymentRecord),
);
adminPaymentRouter.post(
  "/:paymentId/cancel",
  requireCsrf("admin"),
  requirePermission("payments.cancel"),
  asyncHandler(cancelPaymentRecord),
);
adminPaymentRouter.post(
  "/:paymentId/refunds",
  requireCsrf("admin"),
  requirePermission("payments.refund"),
  asyncHandler(refundPaymentRecord),
);
