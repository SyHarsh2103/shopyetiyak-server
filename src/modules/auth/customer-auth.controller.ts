import type { Request, Response } from "express";
import { requestContext } from "../../utils/request-context.js";
import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { clearCustomerAuthCookies, COOKIE_NAMES, setCustomerAuthCookies } from "../../utils/cookies.js";
import {
  emailOnlySchema, resetPasswordSchema, sessionIdParamsSchema, tokenOnlySchema,
  customerLoginSchema, customerRegisterSchema,
} from "./customer-auth.validation.js";
import {
  getCustomerById, listCustomerSessions, loginCustomer, refreshCustomerSession, registerCustomer,
  requestEmailVerification, requestPasswordReset, resetCustomerPassword, revokeAllCustomerSessions,
  revokeCustomerSession, revokeCustomerSessionByRefreshToken, verifyCustomerEmail,
} from "./customer-auth.service.js";

function context(req: Request) { return requestContext(req); }
function requireCustomer(req: Request) {
  if (!req.auth || req.auth.kind !== "customer") throw new ApiError(401, "AUTH_REQUIRED", "Customer authentication is required.");
  return req.auth;
}

export async function register(req: Request, res: Response): Promise<void> {
  const result = await registerCustomer(customerRegisterSchema.parse(req.body), context(req));
  setCustomerAuthCookies(res, result.accessToken, result.refreshToken);
  await writeAudit({ actorType: "CUSTOMER", actorId: result.customer.id, action: "CUSTOMER_REGISTERED", entityType: "Customer", entityId: result.customer.id, request: req });
  res.status(201).json({ success: true, data: { customer: result.customer } });
}
export async function login(req: Request, res: Response): Promise<void> {
  const result = await loginCustomer(customerLoginSchema.parse(req.body), context(req));
  setCustomerAuthCookies(res, result.accessToken, result.refreshToken);
  await writeAudit({ actorType: "CUSTOMER", actorId: result.customer.id, action: "CUSTOMER_LOGIN", entityType: "CustomerSession", entityId: result.sessionId, request: req });
  res.status(200).json({ success: true, data: { customer: result.customer } });
}
export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies[COOKIE_NAMES.customerRefresh] as string | undefined;
  if (!token) throw new ApiError(401, "REFRESH_REQUIRED", "A refresh session is required.");
  const result = await refreshCustomerSession(token);
  setCustomerAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ success: true, data: { customer: result.customer } });
}
export async function logout(req: Request, res: Response): Promise<void> {
  await revokeCustomerSessionByRefreshToken(req.cookies[COOKIE_NAMES.customerRefresh] as string | undefined);
  clearCustomerAuthCookies(res);
  res.status(200).json({ success: true, data: { loggedOut: true } });
}
export async function me(req: Request, res: Response): Promise<void> {
  const auth = requireCustomer(req);
  res.status(200).json({ success: true, data: { customer: await getCustomerById(auth.customerId) } });
}
export async function sessions(req: Request, res: Response): Promise<void> {
  const auth = requireCustomer(req);
  res.status(200).json({ success: true, data: { sessions: await listCustomerSessions(auth.customerId, auth.sessionId) } });
}
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const auth = requireCustomer(req);
  const { sessionId } = sessionIdParamsSchema.parse(req.params);
  await revokeCustomerSession(auth.customerId, sessionId);
  res.status(200).json({ success: true, data: { revoked: true } });
}
export async function logoutAll(req: Request, res: Response): Promise<void> {
  const auth = requireCustomer(req);
  await revokeAllCustomerSessions(auth.customerId);
  clearCustomerAuthCookies(res);
  await writeAudit({ actorType: "CUSTOMER", actorId: auth.customerId, action: "CUSTOMER_LOGOUT_ALL", entityType: "Customer", entityId: auth.customerId, request: req });
  res.status(200).json({ success: true, data: { loggedOutAll: true } });
}
export async function sendVerification(req: Request, res: Response): Promise<void> {
  const auth = requireCustomer(req);
  await requestEmailVerification(auth.customerId);
  res.status(202).json({ success: true, data: { accepted: true } });
}
export async function confirmVerification(req: Request, res: Response): Promise<void> {
  const { token } = tokenOnlySchema.parse(req.body);
  await verifyCustomerEmail(token);
  res.status(200).json({ success: true, data: { verified: true } });
}
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = emailOnlySchema.parse(req.body);
  await requestPasswordReset(email);
  res.status(202).json({ success: true, data: { accepted: true } });
}
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await resetCustomerPassword(token, password);
  clearCustomerAuthCookies(res);
  res.status(200).json({ success: true, data: { reset: true } });
}
