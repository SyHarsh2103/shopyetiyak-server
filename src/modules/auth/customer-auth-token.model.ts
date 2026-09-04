import { model, Schema, Types, type InferSchemaType } from "mongoose";

const customerAuthTokenSchema = new Schema({
  customerId: { type: Types.ObjectId, ref: "Customer", required: true, index: true },
  kind: { type: String, enum: ["EMAIL_VERIFICATION", "PASSWORD_RESET"], required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
customerAuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
customerAuthTokenSchema.index({ customerId: 1, kind: 1, usedAt: 1 });

export type CustomerAuthToken = InferSchemaType<typeof customerAuthTokenSchema>;
export const CustomerAuthTokenModel = model("CustomerAuthToken", customerAuthTokenSchema, "customerAuthTokens");
