import type { Request, Response } from "express";
import { writeAudit } from "../audit/audit.service.js";
import {
  createStaffAdmin,
  createStaffRole,
  getStaffAdmin,
  listAuditLogs,
  listStaffAdmins,
  listStaffPermissions,
  listStaffRoles,
  revokeStaffAdminSessions,
  sendStaffPasswordReset,
  updateStaffAdmin,
  updateStaffRole,
} from "./staff.service.js";
import {
  auditLogListQuerySchema,
  createRoleSchema,
  createStaffAdminSchema,
  roleIdParamSchema,
  staffAdminIdParamSchema,
  staffListQuerySchema,
  updateRoleSchema,
  updateStaffAdminSchema,
} from "./staff.validation.js";

function actor(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new Error("Admin authentication middleware was not applied.");
  }
  return req.auth;
}

export async function listStaffAdminRecords(req: Request, res: Response): Promise<void> {
  const query = staffListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listStaffAdmins(query) });
}

export async function getStaffAdminRecord(req: Request, res: Response): Promise<void> {
  const { id } = staffAdminIdParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: { admin: await getStaffAdmin(id) } });
}

export async function createStaffAdminRecord(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const result = await createStaffAdmin(createStaffAdminSchema.parse(req.body), identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ADMIN_USER_CREATE",
    entityType: "AdminUser",
    entityId: result.admin.id,
    after: result.admin,
    request: req,
  });
  res.status(201).json({ success: true, data: result });
}

export async function updateStaffAdminRecord(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const { id } = staffAdminIdParamSchema.parse(req.params);
  const result = await updateStaffAdmin(id, updateStaffAdminSchema.parse(req.body), identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ADMIN_USER_UPDATE",
    entityType: "AdminUser",
    entityId: id,
    before: result.before,
    after: result.admin,
    request: req,
  });
  res.status(200).json({ success: true, data: { admin: result.admin } });
}

export async function resetStaffAdminPassword(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const { id } = staffAdminIdParamSchema.parse(req.params);
  const result = await sendStaffPasswordReset(id, identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ADMIN_PASSWORD_RESET_ISSUED",
    entityType: "AdminUser",
    entityId: id,
    after: { invitationSent: result.reset.sent, expiresAt: result.reset.expiresAt },
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}

export async function logoutStaffAdminSessions(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const { id } = staffAdminIdParamSchema.parse(req.params);
  const result = await revokeStaffAdminSessions(id, identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ADMIN_SESSIONS_REVOKED",
    entityType: "AdminUser",
    entityId: id,
    after: result,
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}

export async function listRoleRecords(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listStaffRoles() });
}

export async function createRoleRecord(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const role = await createStaffRole(createRoleSchema.parse(req.body), identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ROLE_CREATE",
    entityType: "Role",
    entityId: role.id,
    after: role,
    request: req,
  });
  res.status(201).json({ success: true, data: { role } });
}

export async function updateRoleRecord(req: Request, res: Response): Promise<void> {
  const identity = actor(req);
  const { id } = roleIdParamSchema.parse(req.params);
  const result = await updateStaffRole(id, updateRoleSchema.parse(req.body), identity);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ROLE_UPDATE",
    entityType: "Role",
    entityId: id,
    before: result.before,
    after: result.role,
    request: req,
  });
  res.status(200).json({ success: true, data: { role: result.role } });
}

export async function listPermissionRecords(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, data: await listStaffPermissions() });
}

export async function listAuditLogRecords(req: Request, res: Response): Promise<void> {
  const query = auditLogListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listAuditLogs(query) });
}
