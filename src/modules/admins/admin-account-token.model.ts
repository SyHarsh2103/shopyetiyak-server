import { model, Schema, Types, type InferSchemaType } from "mongoose";

export const ADMIN_ACCOUNT_TOKEN_PURPOSES = [
  "ACCOUNT_SETUP",
  "PASSWORD_RESET",
] as const;

const adminAccountTokenSchema = new Schema(
  {
    adminUserId: {
      type: Types.ObjectId,
      ref: "AdminUser",
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ADMIN_ACCOUNT_TOKEN_PURPOSES,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdByAdminUserId: {
      type: Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adminAccountTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);
adminAccountTokenSchema.index({
  adminUserId: 1,
  purpose: 1,
  usedAt: 1,
  createdAt: -1,
});

export type AdminAccountToken = InferSchemaType<
  typeof adminAccountTokenSchema
>;

export const AdminAccountTokenModel = model(
  "AdminAccountToken",
  adminAccountTokenSchema,
  "adminAccountTokens",
);
