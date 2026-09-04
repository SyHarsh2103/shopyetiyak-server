import { model, Schema, type InferSchemaType } from "mongoose";

const permissionSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  description: { type: String, required: true, maxlength: 240 },
  isSystem: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

export type Permission = InferSchemaType<typeof permissionSchema>;
export const PermissionModel = model("Permission", permissionSchema, "permissions");
