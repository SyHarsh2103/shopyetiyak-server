import { Router } from "express";

import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { reviewCheckout } from "./checkout.controller.js";

export const checkoutRouter = Router();

checkoutRouter.use(optionalCustomerAuth);
checkoutRouter.post("/review", requireCsrf("customer"), asyncHandler(reviewCheckout));
