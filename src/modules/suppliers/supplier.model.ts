import { model, Schema, type InferSchemaType } from "mongoose";

export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const supplierAddressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 180, default: "" },
  line2: { type: String, trim: true, maxlength: 180, default: "" },
  city: { type: String, trim: true, maxlength: 120, default: "" },
  state: { type: String, trim: true, maxlength: 120, default: "" },
  postalCode: { type: String, trim: true, maxlength: 32, default: "" },
  country: { type: String, trim: true, maxlength: 120, default: "" },
}, { _id: false });

const supplierSchema = new Schema({
  companyName: { type: String, required: true, trim: true, maxlength: 180 },
  contactPerson: { type: String, trim: true, maxlength: 160, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  phone: { type: String, trim: true, maxlength: 50, default: "" },
  address: { type: supplierAddressSchema, default: () => ({}) },
  paymentTerms: { type: String, trim: true, maxlength: 500, default: "" },
  taxInformation: { type: String, trim: true, maxlength: 1000, default: "" },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  status: { type: String, required: true, enum: SUPPLIER_STATUSES, default: "ACTIVE", index: true },
}, { timestamps: true, versionKey: false });

supplierSchema.index({ companyName: 1, status: 1 });
supplierSchema.index({ email: 1 });
supplierSchema.index({ companyName: "text", contactPerson: "text", email: "text", phone: "text" });

export type Supplier = InferSchemaType<typeof supplierSchema>;
export const SupplierModel = model("Supplier", supplierSchema, "suppliers");
