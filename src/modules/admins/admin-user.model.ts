import {
  model,
  Schema,
  Types,
  type HydratedDocumentFromSchema,
  type InferSchemaType,
} from "mongoose";

const adminUserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    roleIds: [
      {
        type: Types.ObjectId,
        ref: "Role",
        required: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    mustSetPassword: {
      type: Boolean,
      default: false,
      index: true,
    },
    invitedAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adminUserSchema.index({ roleIds: 1 });
adminUserSchema.index({
  isActive: 1,
  mustSetPassword: 1,
});

export type AdminUser =
  InferSchemaType<typeof adminUserSchema>;

export type AdminUserDocument =
  HydratedDocumentFromSchema<
    typeof adminUserSchema
  >;

export const AdminUserModel = model(
  "AdminUser",
  adminUserSchema,
  "adminUsers",
);