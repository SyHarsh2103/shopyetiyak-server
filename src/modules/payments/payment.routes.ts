import { Router } from "express";

import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { paymentRateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createPaymentIntentRecord,
  getPaymentRecord,
} from "./payment.controller.js";

export const paymentRouter = Router();

paymentRouter.use(optionalCustomerAuth);
paymentRouter.post(
  "/intents",
  paymentRateLimit,
  requireCsrf("customer"),
  asyncHandler(createPaymentIntentRecord),
);
paymentRouter.get("/:paymentId", asyncHandler(getPaymentRecord));
