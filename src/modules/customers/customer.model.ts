import { model, Schema, type InferSchemaType } from "mongoose";

const customerAddressSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    recipientName: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    line1: { type: String, required: true, trim: true, maxlength: 180 },
    line2: { type: String, default: "", trim: true, maxlength: 180 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, required: true, trim: true, maxlength: 120 },
    postalCode: { type: String, required: true, trim: true, maxlength: 32 },
    country: { type: String, required: true, trim: true, maxlength: 120 },
    deliveryInstructions: { type: String, default: "", trim: true, maxlength: 500 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, versionKey: false },
);

const customerSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, default: "", trim: true, maxlength: 40 },
    addresses: { type: [customerAddressSchema], default: [] },
    emailVerifiedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

customerSchema.index({ createdAt: -1 });

export type Customer = InferSchemaType<typeof customerSchema>;
export const CustomerModel = model("Customer", customerSchema, "users");
