import { model, Schema, type InferSchemaType } from "mongoose";

const seoSchema = new Schema({
  title: { type: String, trim: true, maxlength: 70, default: "" },
  description: { type: String, trim: true, maxlength: 180, default: "" },
  keywords: { type: [String], default: [] },
}, { _id: false });

const brandSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true, maxlength: 140 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  websiteUrl: { type: String, trim: true, maxlength: 500, default: "" },
  countryOfOrigin: { type: String, trim: true, maxlength: 120, default: "" },
  isActive: { type: Boolean, default: true, index: true },
  seo: { type: seoSchema, default: () => ({}) },
}, { timestamps: true, versionKey: false });

brandSchema.index({ isActive: 1, name: 1 });

export type Brand = InferSchemaType<typeof brandSchema>;
export const BrandModel = model("Brand", brandSchema, "brands");
