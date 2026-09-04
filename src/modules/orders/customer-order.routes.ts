import { Router } from "express";

import { requireCustomerAuth } from "../../middleware/auth/customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  customerCancelOrder,
  customerOrderDetail,
  customerOrders,
  customerReorder,
} from "./order.controller.js";

export const customerOrderRouter = Router();

customerOrderRouter.use(requireCustomerAuth);
customerOrderRouter.get("/", asyncHandler(customerOrders));
customerOrderRouter.get("/:orderNumber", asyncHandler(customerOrderDetail));
customerOrderRouter.post(
  "/:orderNumber/reorder",
  requireCsrf("customer"),
  asyncHandler(customerReorder),
);
customerOrderRouter.post(
  "/:orderNumber/cancel",
  requireCsrf("customer"),
  asyncHandler(customerCancelOrder),
);
