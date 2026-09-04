import type { RequestHandler } from "express";

import { CustomerSessionModel } from "../../modules/customers/customer-session.model.js";
import { CustomerModel } from "../../modules/customers/customer.model.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { COOKIE_NAMES } from "../../utils/cookies.js";
import { verifyAuthToken } from "../../utils/tokens.js";

export const optionalCustomerAuth: RequestHandler = asyncHandler(
  async (req, _res, next) => {
    const token = req.cookies[COOKIE_NAMES.customerAccess] as string | undefined;

    if (!token) {
      next();
      return;
    }

    const claims = await verifyAuthToken(token, "customer_access");
    const [session, customer] = await Promise.all([
      CustomerSessionModel.findById(claims.sessionId).lean(),
      CustomerModel.findById(claims.subjectId).lean(),
    ]);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !customer?.isActive
    ) {
      throw new ApiError(
        401,
        "SESSION_REVOKED",
        "The customer session is no longer active.",
      );
    }

    req.auth = {
      kind: "customer",
      customerId: claims.subjectId,
      sessionId: claims.sessionId,
    };

    next();
  },
);
