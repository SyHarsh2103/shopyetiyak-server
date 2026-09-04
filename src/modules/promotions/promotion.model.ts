import { model, Schema, type InferSchemaType } from "mongoose";

export const PROMOTION_TYPES = [
  "PERCENTAGE",
  "FIXED",
  "FREE_DELIVERY",
] as const;

export const PROMOTION_SCOPES = [
  "CART",
  "PRODUCT",
  "CATEGORY",
  "BRAND",
  "COLLECTION",
] as const;

const promotionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 1500, default: "" },
    type: { type: String, required: true, enum: PROMOTION_TYPES },
    scope: { type: String, required: true, enum: PROMOTION_SCOPES, default: "CART" },
    percentageBasisPoints: { type: Number, min: 1, max: 10000, default: null },
    fixedAmountMinor: { type: Number, min: 1, default: null },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
    minimumSubtotalMinor: { type: Number, min: 0, default: 0 },
    maximumDiscountMinor: { type: Number, min: 1, default: null },
    storeIds: [{ type: Schema.Types.ObjectId, ref: "StoreLocation" }],
    productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    brandIds: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
    collectionIds: [{ type: Schema.Types.ObjectId, ref: "Collection" }],
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    priority: { type: Number, min: 0, max: 100000, default: 100 },
    stackableWithCoupons: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

promotionSchema.index({ slug: 1 }, { unique: true });
promotionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1, priority: 1 });
promotionSchema.index({ storeIds: 1, isActive: 1 });
promotionSchema.index({ productIds: 1, isActive: 1 });
promotionSchema.index({ categoryIds: 1, isActive: 1 });
promotionSchema.index({ brandIds: 1, isActive: 1 });
promotionSchema.index({ collectionIds: 1, isActive: 1 });

export type Promotion = InferSchemaType<typeof promotionSchema>;
export const PromotionModel = model("Promotion", promotionSchema, "promotions");
