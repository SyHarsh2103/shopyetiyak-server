import type { RequestHandler } from "express";
import { AdminUserModel } from "../../modules/admins/admin-user.model.js";
import { AdminSessionModel } from "../../modules/admins/admin-session.model.js";
import { resolveRoleAccess } from "../../modules/roles/rbac.service.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { COOKIE_NAMES } from "../../utils/cookies.js";
import { verifyAuthToken } from "../../utils/tokens.js";

export const requireAdminAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies[COOKIE_NAMES.adminAccess] as string | undefined;
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  const claims = await verifyAuthToken(token, "admin_access");
  const [session, admin] = await Promise.all([
    AdminSessionModel.findById(claims.sessionId).lean(),
    AdminUserModel.findById(claims.subjectId).lean(),
  ]);
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !admin?.isActive) {
    throw new ApiError(401, "SESSION_REVOKED", "The admin session is no longer active.");
  }
  const access = await resolveRoleAccess(admin.roleIds);
  req.auth = { kind: "admin", adminUserId: claims.subjectId, sessionId: claims.sessionId, ...access };
  next();
});
