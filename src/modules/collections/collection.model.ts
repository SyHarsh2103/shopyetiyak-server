import { model, Schema, type InferSchemaType } from "mongoose";

const seoSchema = new Schema({
  title: { type: String, trim: true, maxlength: 70, default: "" },
  description: { type: String, trim: true, maxlength: 180, default: "" },
  keywords: { type: [String], default: [] },
}, { _id: false });

const collectionSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true, maxlength: 140 },
  description: { type: String, trim: true, maxlength: 1500, default: "" },
  sortOrder: { type: Number, default: 0, min: 0, max: 100000 },
  merchandisingType: { type: String, enum: ["STANDARD", "WEEKLY_DEAL", "FESTIVAL", "BEST_SELLERS", "NEW_ARRIVALS"], default: "STANDARD", index: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
  seo: { type: seoSchema, default: () => ({}) },
}, { timestamps: true, versionKey: false });

collectionSchema.index({ isActive: 1, merchandisingType: 1, startsAt: 1, endsAt: 1, sortOrder: 1 });

export type Collection = InferSchemaType<typeof collectionSchema>;
export const CollectionModel = model("Collection", collectionSchema, "collections");
