import type { Request, Response } from "express";
import { requestContext } from "../../utils/request-context.js";
import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { clearAdminAuthCookies, COOKIE_NAMES, setAdminAuthCookies } from "../../utils/cookies.js";
import { completeAdminPasswordSetup } from "../admins/staff.service.js";
import { adminCompletePasswordSetupSchema, adminLoginSchema } from "./admin-auth.validation.js";
import { getAdminById, loginAdmin, refreshAdminSession, revokeAdminSessionByRefreshToken, revokeAllAdminSessions } from "./admin-auth.service.js";

function context(req: Request) { return requestContext(req); }
function requireAdmin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  return req.auth;
}

export async function adminLogin(req: Request, res: Response): Promise<void> {
  const result = await loginAdmin(adminLoginSchema.parse(req.body), context(req));
  setAdminAuthCookies(res, result.accessToken, result.refreshToken);
  await writeAudit({ actorType: "ADMIN", actorId: result.admin.id, actorRoleNames: result.admin.roleNames, action: "ADMIN_LOGIN", entityType: "AdminSession", entityId: result.sessionId, request: req });
  res.status(200).json({ success: true, data: { admin: result.admin } });
}
export async function adminRefresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies[COOKIE_NAMES.adminRefresh] as string | undefined;
  if (!token) throw new ApiError(401, "REFRESH_REQUIRED", "A refresh session is required.");
  const result = await refreshAdminSession(token);
  setAdminAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ success: true, data: { admin: result.admin } });
}
export async function adminLogout(req: Request, res: Response): Promise<void> {
  await revokeAdminSessionByRefreshToken(req.cookies[COOKIE_NAMES.adminRefresh] as string | undefined);
  clearAdminAuthCookies(res);
  res.status(200).json({ success: true, data: { loggedOut: true } });
}
export async function adminMe(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req);
  res.status(200).json({ success: true, data: { admin: await getAdminById(auth.adminUserId) } });
}
export async function adminLogoutAll(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req);
  await revokeAllAdminSessions(auth.adminUserId);
  clearAdminAuthCookies(res);
  await writeAudit({ actorType: "ADMIN", actorId: auth.adminUserId, actorRoleNames: auth.roleNames, action: "ADMIN_LOGOUT_ALL", entityType: "AdminUser", entityId: auth.adminUserId, request: req });
  res.status(200).json({ success: true, data: { loggedOutAll: true } });
}

export async function adminCompletePasswordSetup(req: Request, res: Response): Promise<void> {
  const input = adminCompletePasswordSetupSchema.parse(req.body);
  const result = await completeAdminPasswordSetup(input.token, input.password);
  res.status(200).json({ success: true, data: result });
}
