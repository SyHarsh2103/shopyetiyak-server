import { model, Schema, type InferSchemaType } from "mongoose";

export const COUPON_DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    discountType: {
      type: String,
      required: true,
      enum: COUPON_DISCOUNT_TYPES,
    },
    percentageBasisPoints: {
      type: Number,
      min: 1,
      max: 10000,
      default: null,
    },
    fixedAmountMinor: {
      type: Number,
      min: 1,
      default: null,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: "USD",
    },
    minimumSubtotalMinor: {
      type: Number,
      min: 0,
      default: 0,
    },
    maximumDiscountMinor: {
      type: Number,
      min: 1,
      default: null,
    },
    usageLimit: { type: Number, min: 1, default: null },
    customerUsageLimit: { type: Number, min: 1, default: null },
    productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    brandIds: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
    collectionIds: [{ type: Schema.Types.ObjectId, ref: "Collection" }],
    stackableWithPromotions: { type: Boolean, default: true },
    storeIds: [{ type: Schema.Types.ObjectId, ref: "StoreLocation" }],
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
couponSchema.index({ storeIds: 1, isActive: 1 });

export type Coupon = InferSchemaType<typeof couponSchema>;
export const CouponModel = model("Coupon", couponSchema, "coupons");
