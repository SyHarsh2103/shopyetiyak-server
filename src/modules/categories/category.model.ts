import { model, Schema, type InferSchemaType } from "mongoose";

const seoSchema = new Schema({
  title: { type: String, trim: true, maxlength: 70, default: "" },
  description: { type: String, trim: true, maxlength: 180, default: "" },
  keywords: { type: [String], default: [] },
}, { _id: false });

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true, maxlength: 140 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
  sortOrder: { type: Number, default: 0, min: 0, max: 100000 },
  isActive: { type: Boolean, default: true, index: true },
  seo: { type: seoSchema, default: () => ({}) },
}, { timestamps: true, versionKey: false });

categorySchema.index({ parentId: 1, sortOrder: 1, name: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });

export type Category = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model("Category", categorySchema, "categories");
