import type { Request } from "express";
import { Types } from "mongoose";
import { requestContext } from "../../utils/request-context.js";
import { AuditLogModel } from "./audit-log.model.js";

interface WriteAuditInput {
  actorType: "ADMIN" | "CUSTOMER" | "SYSTEM";
  actorId?: string;
  actorRoleNames?: string[];
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  request?: Request;
}

export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const context = input.request ? requestContext(input.request) : {};
  await AuditLogModel.create({
    actorType: input.actorType,
    actorId: input.actorId ? new Types.ObjectId(input.actorId) : null,
    actorRoleNames: input.actorRoleNames ?? [],
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: context.ip,
    userAgent: context.userAgent,
  });
}
