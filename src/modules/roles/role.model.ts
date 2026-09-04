import { model, Schema, type InferSchemaType } from "mongoose";

const roleSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
  description: { type: String, required: true, maxlength: 240 },
  permissionKeys: [{ type: String, required: true, lowercase: true, trim: true }],
  isSystem: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

export type Role = InferSchemaType<typeof roleSchema>;
export const RoleModel = model("Role", roleSchema, "roles");
