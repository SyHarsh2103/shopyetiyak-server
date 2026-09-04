import { model, Schema, type InferSchemaType } from "mongoose";

export const PRODUCT_TYPES = ["FIXED_QUANTITY", "PACKAGED", "WEIGHT_BASED", "VARIABLE_WEIGHT"] as const;
export const SELLING_UNITS = [
  "EACH", "PACK", "BOX", "BAG", "BOTTLE", "CAN", "DOZEN",
  "GRAM", "KILOGRAM", "OUNCE", "POUND", "MILLILITER", "LITER",
] as const;
export const VARIANT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const seoSchema = new Schema({
  title: { type: String, trim: true, maxlength: 70, default: "" },
  description: { type: String, trim: true, maxlength: 180, default: "" },
  keywords: { type: [String], default: [] },
}, { _id: false });

const imageSchema = new Schema({
  storageKey: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  originalName: { type: String, required: true, trim: true, maxlength: 255 },
  mimeType: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 1 },
  altText: { type: String, trim: true, maxlength: 180, default: "" },
  sortOrder: { type: Number, min: 0, max: 1000, default: 0 },
  isPrimary: { type: Boolean, default: false },
}, { _id: false });

const attributeSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  value: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false });

const weightSchema = new Schema({
  value: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, enum: ["GRAM", "KILOGRAM", "OUNCE", "POUND"] },
}, { _id: false });

const dimensionsSchema = new Schema({
  length: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 0 },
  height: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, enum: ["CM", "IN"] },
}, { _id: false });

const pricingSchema = new Schema({
  currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: "USD" },
  costPriceMinor: { type: Number, required: true, min: 0 },
  regularPriceMinor: { type: Number, required: true, min: 0 },
  salePriceMinor: { type: Number, min: 0, default: null },
}, { _id: false });

const variantSchema = new Schema({
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  barcode: { type: String, trim: true, uppercase: true, maxlength: 80, default: undefined },
  upc: { type: String, trim: true, uppercase: true, maxlength: 32, default: undefined },
  ean: { type: String, trim: true, uppercase: true, maxlength: 32, default: undefined },
  attributes: { type: [attributeSchema], default: [] },
  pricing: { type: pricingSchema, required: true },
  sellingUnit: { type: String, required: true, enum: SELLING_UNITS, default: "EACH" },
  unitQuantity: { type: Number, required: true, min: 0.001, default: 1 },
  minimumQuantity: { type: Number, required: true, min: 0.001, default: 1 },
  maximumQuantity: { type: Number, min: 0.001, default: null },
  quantityIncrement: { type: Number, required: true, min: 0.001, default: 1 },
  weight: { type: weightSchema, default: null },
  dimensions: { type: dimensionsSchema, default: null },
  status: { type: String, required: true, enum: VARIANT_STATUSES, default: "ACTIVE" },
}, { _id: true });

const nutritionSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  value: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false });

const dietarySchema = new Schema({
  vegetarian: { type: Boolean, default: false },
  vegan: { type: Boolean, default: false },
  glutenFree: { type: Boolean, default: false },
  halal: { type: Boolean, default: false },
  organic: { type: Boolean, default: false },
}, { _id: false });

const productSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  shortDescription: { type: String, trim: true, maxlength: 500, default: "" },
  description: { type: String, trim: true, maxlength: 12000, default: "" },
  brandId: { type: Schema.Types.ObjectId, ref: "Brand", default: null },
  categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
  collectionIds: [{ type: Schema.Types.ObjectId, ref: "Collection" }],
  images: { type: [imageSchema], default: [] },
  productType: { type: String, required: true, enum: PRODUCT_TYPES, default: "FIXED_QUANTITY", index: true },
  countryOfOrigin: { type: String, trim: true, maxlength: 120, default: "" },
  ingredients: { type: [String], default: [] },
  nutrition: { type: [nutritionSchema], default: [] },
  allergens: { type: [String], default: [] },
  storageInstructions: { type: String, trim: true, maxlength: 1500, default: "" },
  dietary: { type: dietarySchema, default: () => ({}) },
  taxClassification: { type: String, trim: true, maxlength: 100, default: "" },
  tags: { type: [String], default: [] },
  relatedProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  frequentlyBoughtTogetherIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  variants: { type: [variantSchema], required: true, validate: [(value: unknown[]) => value.length > 0, "At least one product variant is required."] },
  seo: { type: seoSchema, default: () => ({}) },
  isActive: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ "variants.sku": 1 }, { unique: true });
productSchema.index({ "variants.barcode": 1 }, { unique: true, sparse: true });
productSchema.index({ "variants.upc": 1 }, { unique: true, sparse: true });
productSchema.index({ "variants.ean": 1 }, { unique: true, sparse: true });
productSchema.index({ categoryIds: 1, isActive: 1 });
productSchema.index({ collectionIds: 1, isActive: 1 });
productSchema.index({ brandId: 1, isActive: 1 });
productSchema.index({ archivedAt: 1, createdAt: -1 });
productSchema.index({ name: "text", shortDescription: "text", tags: "text" });

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = model("Product", productSchema, "products");
