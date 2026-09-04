import { model, Schema, Types, type InferSchemaType } from "mongoose";

const adminSessionSchema = new Schema({
  adminUserId: { type: Types.ObjectId, ref: "AdminUser", required: true, index: true },
  refreshTokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  lastUsedAt: { type: Date, required: true },
  ip: { type: String, maxlength: 128 },
  userAgent: { type: String, maxlength: 512 },
}, { timestamps: true, versionKey: false });
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
adminSessionSchema.index({ adminUserId: 1, revokedAt: 1, createdAt: -1 });

export type AdminSession = InferSchemaType<typeof adminSessionSchema>;
export const AdminSessionModel = model("AdminSession", adminSessionSchema, "adminSessions");
