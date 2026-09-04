import { model, Schema, type InferSchemaType } from "mongoose";

export const STORE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const addressSchema = new Schema({
  line1: { type: String, required: true, trim: true, maxlength: 180 },
  line2: { type: String, trim: true, maxlength: 180, default: "" },
  city: { type: String, required: true, trim: true, maxlength: 120 },
  state: { type: String, required: true, trim: true, maxlength: 120 },
  postalCode: { type: String, required: true, trim: true, maxlength: 32 },
  country: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false });

const businessHourSchema = new Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  isClosed: { type: Boolean, default: false },
  opensAt: { type: String, trim: true, maxlength: 5, default: "09:00" },
  closesAt: { type: String, trim: true, maxlength: 5, default: "18:00" },
}, { _id: false });

const storeLocationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  address: { type: addressSchema, required: true },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
  timezone: { type: String, required: true, trim: true, maxlength: 80, default: "America/New_York" },
  businessHours: { type: [businessHourSchema], default: [] },
  pickupEnabled: { type: Boolean, default: true },
  deliveryEnabled: { type: Boolean, default: true },
  status: { type: String, required: true, enum: STORE_STATUSES, default: "ACTIVE", index: true },
}, { timestamps: true, versionKey: false });

storeLocationSchema.index({ code: 1 }, { unique: true });
storeLocationSchema.index({ status: 1, name: 1 });

export type StoreLocation = InferSchemaType<typeof storeLocationSchema>;
export const StoreLocationModel = model("StoreLocation", storeLocationSchema, "storeLocations");
