import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { sha256 } from "../../utils/crypto.js";
import { verifyPassword } from "../../utils/password.js";
import { signAuthToken, verifyAuthToken } from "../../utils/tokens.js";
import { AdminSessionModel } from "../admins/admin-session.model.js";
import { AdminUserModel } from "../admins/admin-user.model.js";
import { resolveRoleAccess } from "../roles/rbac.service.js";
import type { z } from "zod";
import type { adminLoginSchema } from "./admin-auth.validation.js";

type LoginInput = z.infer<typeof adminLoginSchema>;
interface SessionContext { ip?: string; userAgent?: string }

async function publicAdmin(admin: { _id: unknown; email: string; fullName: string; roleIds: readonly unknown[] }) {
  const access = await resolveRoleAccess(admin.roleIds);
  return { id: String(admin._id), email: admin.email, fullName: admin.fullName, ...access };
}

async function createSession(adminUserId: string, context: SessionContext) {
  const sessionId = new Types.ObjectId();
  const accessToken = await signAuthToken({ subjectId: adminUserId, sessionId: sessionId.toHexString(), kind: "admin_access" });
  const refreshToken = await signAuthToken({ subjectId: adminUserId, sessionId: sessionId.toHexString(), kind: "admin_refresh" });
  await AdminSessionModel.create({
    _id: sessionId,
    adminUserId: new Types.ObjectId(adminUserId),
    refreshTokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    lastUsedAt: new Date(), ip: context.ip, userAgent: context.userAgent,
  });
  return { accessToken, refreshToken, sessionId: sessionId.toHexString() };
}

export async function loginAdmin(input: LoginInput, context: SessionContext) {
  const admin = await AdminUserModel.findOne({ email: input.email }).select("+passwordHash");
  if (
    !admin ||
    !admin.isActive ||
    admin.mustSetPassword === true ||
    !(await verifyPassword(input.password, admin.passwordHash))
  ) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  admin.lastLoginAt = new Date();
  await admin.save();
  const session = await createSession(admin.id, context);
  return { admin: await publicAdmin(admin), ...session };
}

export async function refreshAdminSession(refreshToken: string) {
  const claims = await verifyAuthToken(refreshToken, "admin_refresh");
  const session = await AdminSessionModel.findById(claims.sessionId);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, "SESSION_REVOKED", "The admin session is no longer active.");
  if (session.refreshTokenHash !== sha256(refreshToken)) {
    session.revokedAt = new Date(); await session.save();
    throw new ApiError(401, "REFRESH_TOKEN_REUSE", "The session was revoked because token reuse was detected.");
  }
  const admin = await AdminUserModel.findById(claims.subjectId);
  if (!admin?.isActive) throw new ApiError(401, "ACCOUNT_DISABLED", "This admin account is not active.");
  const accessToken = await signAuthToken({ subjectId: admin.id, sessionId: session.id, kind: "admin_access" });
  const nextRefreshToken = await signAuthToken({ subjectId: admin.id, sessionId: session.id, kind: "admin_refresh" });
  session.refreshTokenHash = sha256(nextRefreshToken); session.lastUsedAt = new Date(); await session.save();
  return { admin: await publicAdmin(admin), accessToken, refreshToken: nextRefreshToken };
}

export async function getAdminById(adminUserId: string) {
  const admin = await AdminUserModel.findById(adminUserId).lean();
  if (!admin?.isActive) throw new ApiError(404, "ADMIN_NOT_FOUND", "Admin user not found.");
  return publicAdmin(admin);
}

export async function revokeAdminSessionByRefreshToken(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const claims = await verifyAuthToken(refreshToken, "admin_refresh");
    await AdminSessionModel.updateOne({ _id: claims.sessionId, adminUserId: claims.subjectId }, { $set: { revokedAt: new Date() } });
  } catch { /* idempotent logout */ }
}

export async function revokeAllAdminSessions(adminUserId: string): Promise<void> {
  await AdminSessionModel.updateMany({ adminUserId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
