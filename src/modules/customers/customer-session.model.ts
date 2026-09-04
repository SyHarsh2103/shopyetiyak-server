import { model, Schema, Types, type InferSchemaType } from "mongoose";

const customerSessionSchema = new Schema({
  customerId: { type: Types.ObjectId, ref: "Customer", required: true, index: true },
  refreshTokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  lastUsedAt: { type: Date, required: true },
  ip: { type: String, maxlength: 128 },
  userAgent: { type: String, maxlength: 512 },
}, { timestamps: true, versionKey: false });
customerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
customerSessionSchema.index({ customerId: 1, revokedAt: 1, createdAt: -1 });

export type CustomerSession = InferSchemaType<typeof customerSessionSchema>;
export const CustomerSessionModel = model("CustomerSession", customerSessionSchema, "customerSessions");
