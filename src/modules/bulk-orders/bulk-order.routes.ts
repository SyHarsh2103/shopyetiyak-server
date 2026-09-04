import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { paymentRateLimit, publicSubmissionRateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  getAdminBulkRequests,
  getAdminQuotes,
  getPublicQuote,
  patchAdminBulkRequest,
  patchAdminQuote,
  postAcceptQuote,
  postAdminCancelQuote,
  postAdminQuote,
  postAdminSendQuote,
  postBulkOrderRequest,
  postConvertQuote,
  postQuoteDepositIntent,
  postQuoteOrderPaymentIntent,
} from "./bulk-order.controller.js";

export const bulkOrderRouter = Router();
bulkOrderRouter.use(optionalCustomerAuth);
bulkOrderRouter.post("/requests", publicSubmissionRateLimit, requireCsrf("customer"), asyncHandler(postBulkOrderRequest));
bulkOrderRouter.get("/quotes/:id", asyncHandler(getPublicQuote));
bulkOrderRouter.post("/quotes/:id/accept", requireCsrf("customer"), asyncHandler(postAcceptQuote));
bulkOrderRouter.post("/quotes/:id/deposit-intent", paymentRateLimit, requireCsrf("customer"), asyncHandler(postQuoteDepositIntent));
bulkOrderRouter.post("/quotes/:id/order-payment-intent", paymentRateLimit, requireCsrf("customer"), asyncHandler(postQuoteOrderPaymentIntent));

export const adminBulkOrderRouter = Router();
adminBulkOrderRouter.use(requireAdminAuth);
adminBulkOrderRouter.get("/requests", requirePermission("bulk-orders.read"), asyncHandler(getAdminBulkRequests));
adminBulkOrderRouter.patch("/requests/:id", requireCsrf("admin"), requirePermission("bulk-orders.manage"), asyncHandler(patchAdminBulkRequest));
adminBulkOrderRouter.get("/quotes", requirePermission("quotes.read"), asyncHandler(getAdminQuotes));
adminBulkOrderRouter.post("/quotes", requireCsrf("admin"), requirePermission("quotes.manage"), asyncHandler(postAdminQuote));
adminBulkOrderRouter.patch("/quotes/:id", requireCsrf("admin"), requirePermission("quotes.manage"), asyncHandler(patchAdminQuote));
adminBulkOrderRouter.post("/quotes/:id/send", requireCsrf("admin"), requirePermission("quotes.manage"), asyncHandler(postAdminSendQuote));
adminBulkOrderRouter.post("/quotes/:id/cancel", requireCsrf("admin"), requirePermission("quotes.manage"), asyncHandler(postAdminCancelQuote));
adminBulkOrderRouter.post("/quotes/:id/convert", requireCsrf("admin"), requirePermission("quotes.convert"), asyncHandler(postConvertQuote));
