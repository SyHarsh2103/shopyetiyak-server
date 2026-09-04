import { model, Schema, type InferSchemaType } from "mongoose";

const couponRedemptionSchema = new Schema(
  {
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    discountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
  },
  { timestamps: true, versionKey: false },
);

couponRedemptionSchema.index({ couponId: 1, orderId: 1 }, { unique: true });
couponRedemptionSchema.index({ couponId: 1, customerId: 1, createdAt: -1 });
export type CouponRedemption = InferSchemaType<typeof couponRedemptionSchema>;
export const CouponRedemptionModel = model("CouponRedemption", couponRedemptionSchema, "couponRedemptions");
