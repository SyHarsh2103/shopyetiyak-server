import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCustomerAuth } from "../../middleware/auth/customer-auth.js";
import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { customerValueRateLimit } from "../../middleware/rate-limit.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  adminAdjustGiftCard,
  adminAdjustLoyalty,
  adminAdjustStoreCredit,
  adminBackInStockSubscriptions,
  adminCreateGiftCard,
  adminCustomerValues,
  adminDispatchBackInStock,
  adminGiftCards,
  adminSetGiftCardStatus,
  cancelBackInStockSubscription,
  createBackInStockSubscription,
  customerValueSummary,
  giftCardBalance,
} from "./customer-value.controller.js";

export const customerValueRouter = Router();
export const adminCustomerValueRouter = Router();

customerValueRouter.get(
  "/gift-cards/balance",
  customerValueRateLimit,
  asyncHandler(giftCardBalance),
);
customerValueRouter.post(
  "/back-in-stock",
  customerValueRateLimit,
  optionalCustomerAuth,
  requireCsrf("customer"),
  asyncHandler(createBackInStockSubscription),
);
customerValueRouter.post(
  "/back-in-stock/cancel",
  customerValueRateLimit,
  requireCsrf("customer"),
  asyncHandler(cancelBackInStockSubscription),
);
customerValueRouter.get(
  "/account",
  requireCustomerAuth,
  asyncHandler(customerValueSummary),
);

adminCustomerValueRouter.use(requireAdminAuth);
adminCustomerValueRouter.get(
  "/customers",
  requirePermission("customer-value.read"),
  asyncHandler(adminCustomerValues),
);
adminCustomerValueRouter.post(
  "/loyalty/adjust",
  requireCsrf("admin"),
  requirePermission("loyalty.manage"),
  asyncHandler(adminAdjustLoyalty),
);
adminCustomerValueRouter.post(
  "/store-credit/adjust",
  requireCsrf("admin"),
  requirePermission("store-credit.manage"),
  asyncHandler(adminAdjustStoreCredit),
);
adminCustomerValueRouter.get(
  "/gift-cards",
  requirePermission("gift-cards.read"),
  asyncHandler(adminGiftCards),
);
adminCustomerValueRouter.post(
  "/gift-cards",
  requireCsrf("admin"),
  requirePermission("gift-cards.manage"),
  asyncHandler(adminCreateGiftCard),
);
adminCustomerValueRouter.post(
  "/gift-cards/:giftCardId/adjust",
  requireCsrf("admin"),
  requirePermission("gift-cards.manage"),
  asyncHandler(adminAdjustGiftCard),
);
adminCustomerValueRouter.patch(
  "/gift-cards/:giftCardId/status",
  requireCsrf("admin"),
  requirePermission("gift-cards.manage"),
  asyncHandler(adminSetGiftCardStatus),
);
adminCustomerValueRouter.get(
  "/back-in-stock",
  requirePermission("back-in-stock.read"),
  asyncHandler(adminBackInStockSubscriptions),
);
adminCustomerValueRouter.post(
  "/back-in-stock/dispatch",
  requireCsrf("admin"),
  requirePermission("back-in-stock.manage"),
  asyncHandler(adminDispatchBackInStock),
);
