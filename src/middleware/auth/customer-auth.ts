import type { RequestHandler } from "express";
import { CustomerModel } from "../../modules/customers/customer.model.js";
import { CustomerSessionModel } from "../../modules/customers/customer-session.model.js";
import { ApiError } from "../../utils/api-error.js";
import { COOKIE_NAMES } from "../../utils/cookies.js";
import { verifyAuthToken } from "../../utils/tokens.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const requireCustomerAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies[COOKIE_NAMES.customerAccess] as string | undefined;
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Customer authentication is required.");
  const claims = await verifyAuthToken(token, "customer_access");
  const [session, customer] = await Promise.all([
    CustomerSessionModel.findById(claims.sessionId).lean(),
    CustomerModel.findById(claims.subjectId).lean(),
  ]);
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !customer?.isActive) {
    throw new ApiError(401, "SESSION_REVOKED", "The customer session is no longer active.");
  }
  req.auth = { kind: "customer", customerId: claims.subjectId, sessionId: claims.sessionId };
  next();
});
