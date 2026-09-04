import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAnyPermission, requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createRoleRecord,
  createStaffAdminRecord,
  getStaffAdminRecord,
  listAuditLogRecords,
  listPermissionRecords,
  listRoleRecords,
  listStaffAdminRecords,
  logoutStaffAdminSessions,
  resetStaffAdminPassword,
  updateRoleRecord,
  updateStaffAdminRecord,
} from "./staff.controller.js";

export const staffRouter = Router();

staffRouter.use(requireAdminAuth);

staffRouter.get(
  "/users",
  requirePermission("staff.manage"),
  asyncHandler(listStaffAdminRecords),
);
staffRouter.get(
  "/users/:id",
  requirePermission("staff.manage"),
  asyncHandler(getStaffAdminRecord),
);
staffRouter.post(
  "/users",
  requireCsrf("admin"),
  requirePermission("staff.manage"),
  asyncHandler(createStaffAdminRecord),
);
staffRouter.patch(
  "/users/:id",
  requireCsrf("admin"),
  requirePermission("staff.manage"),
  asyncHandler(updateStaffAdminRecord),
);
staffRouter.post(
  "/users/:id/reset-password",
  requireCsrf("admin"),
  requirePermission("staff.manage"),
  asyncHandler(resetStaffAdminPassword),
);
staffRouter.post(
  "/users/:id/logout-all",
  requireCsrf("admin"),
  requirePermission("staff.manage"),
  asyncHandler(logoutStaffAdminSessions),
);

staffRouter.get(
  "/roles",
  requireAnyPermission(["staff.manage", "roles.manage", "permissions.manage"]),
  asyncHandler(listRoleRecords),
);
staffRouter.post(
  "/roles",
  requireCsrf("admin"),
  requirePermission("roles.manage"),
  requirePermission("permissions.manage"),
  asyncHandler(createRoleRecord),
);
staffRouter.patch(
  "/roles/:id",
  requireCsrf("admin"),
  requirePermission("roles.manage"),
  requirePermission("permissions.manage"),
  asyncHandler(updateRoleRecord),
);

staffRouter.get(
  "/permissions",
  requirePermission("permissions.manage"),
  asyncHandler(listPermissionRecords),
);

staffRouter.get(
  "/audit-logs",
  requirePermission("audit.read"),
  asyncHandler(listAuditLogRecords),
);
