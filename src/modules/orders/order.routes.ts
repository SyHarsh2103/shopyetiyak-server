import { Router } from "express";

import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ownerOrderDetail } from "./order.controller.js";

export const orderRouter = Router();

orderRouter.use(optionalCustomerAuth);
orderRouter.get("/:orderId", asyncHandler(ownerOrderDetail));
