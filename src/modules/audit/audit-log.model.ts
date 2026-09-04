import { model, Schema, Types, type InferSchemaType } from "mongoose";

const auditLogSchema = new Schema({
  actorType: { type: String, enum: ["ADMIN", "CUSTOMER", "SYSTEM"], required: true, index: true },
  actorId: { type: Types.ObjectId, default: null, index: true },
  actorRoleNames: [{ type: String }],
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, default: null, index: true },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  ip: { type: String, maxlength: 128 },
  userAgent: { type: String, maxlength: 512 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model("AuditLog", auditLogSchema, "auditLogs");
