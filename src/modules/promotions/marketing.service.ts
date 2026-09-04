import { Types } from "mongoose";
import type { z } from "zod";

import { BannerModel } from "../banners/banner.model.js";
import type { bannerInputSchema, bannerUpdateSchema } from "../banners/banner.validation.js";
import { BundleModel } from "../bundles/bundle.model.js";
import type { bundleInputSchema, bundleUpdateSchema } from "../bundles/bundle.validation.js";
import { CouponModel } from "../coupons/coupon.model.js";
import { CouponRedemptionModel } from "../coupons/coupon-redemption.model.js";
import { ProductModel } from "../products/product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { PromotionModel } from "./promotion.model.js";
import type { promotionInputSchema, promotionUpdateSchema } from "./promotion.validation.js";
import type { couponInputSchema, couponUpdateSchema } from "./marketing.validation.js";

type PromotionInput = z.infer<typeof promotionInputSchema>;
type PromotionUpdate = z.infer<typeof promotionUpdateSchema>;
type CouponInput = z.infer<typeof couponInputSchema>;
type CouponUpdate = z.infer<typeof couponUpdateSchema>;
type BannerInput = z.infer<typeof bannerInputSchema>;
type BannerUpdate = z.infer<typeof bannerUpdateSchema>;
type BundleInput = z.infer<typeof bundleInputSchema>;
type BundleUpdate = z.infer<typeof bundleUpdateSchema>;

function activeNowFilter(now = new Date()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
}

export async function listPromotions() { return PromotionModel.find().sort({ priority: 1, createdAt: -1 }).lean(); }
export async function createPromotion(input: PromotionInput) { return PromotionModel.create(input); }
export async function updatePromotion(id: string, input: PromotionUpdate) {
  const record = await PromotionModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true });
  if (!record) throw new ApiError(404, "PROMOTION_NOT_FOUND", "Promotion was not found.");
  return record;
}

export async function listCoupons() {
  const coupons = await CouponModel.find().sort({ createdAt: -1 }).lean();
  const ids = coupons.map((coupon) => coupon._id);
  const counts = ids.length ? await CouponRedemptionModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { couponId: { $in: ids } } },
    { $group: { _id: "$couponId", count: { $sum: 1 } } },
  ]) : [];
  const map = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
  return coupons.map((coupon) => ({ ...coupon, redemptionCount: map.get(coupon._id.toString()) ?? 0 }));
}
export async function createCoupon(input: CouponInput) { return CouponModel.create(input); }
export async function updateCoupon(id: string, input: CouponUpdate) {
  const record = await CouponModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true });
  if (!record) throw new ApiError(404, "COUPON_NOT_FOUND", "Coupon was not found.");
  return record;
}

export async function listBanners() { return BannerModel.find().sort({ placement: 1, sortOrder: 1, createdAt: -1 }).lean(); }
export async function createBanner(input: BannerInput) { return BannerModel.create(input); }
export async function updateBanner(id: string, input: BannerUpdate) {
  const record = await BannerModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true });
  if (!record) throw new ApiError(404, "BANNER_NOT_FOUND", "Banner was not found.");
  return record;
}

export async function listBundles() { return BundleModel.find().sort({ isFeatured: -1, createdAt: -1 }).lean(); }
export async function createBundle(input: BundleInput) { return BundleModel.create(input); }
export async function updateBundle(id: string, input: BundleUpdate) {
  const record = await BundleModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true });
  if (!record) throw new ApiError(404, "BUNDLE_NOT_FOUND", "Bundle was not found.");
  return record;
}

export async function publicMarketing(storeId?: string) {
  const now = new Date();
  const storeFilter = storeId ? { $or: [{ storeIds: { $size: 0 } }, { storeIds: new Types.ObjectId(storeId) }] } : {};
  const [banners, promotions, featuredProducts, newArrivals, bestSellers, bundles] = await Promise.all([
    BannerModel.find({ ...activeNowFilter(now), ...storeFilter }).sort({ placement: 1, sortOrder: 1 }).lean(),
    PromotionModel.find({ ...activeNowFilter(now), ...storeFilter }).sort({ priority: 1 }).lean(),
    ProductModel.find({ isActive: true, archivedAt: null, isFeatured: true }).select({ name: 1, slug: 1, images: 1, variants: 1 }).sort({ updatedAt: -1 }).limit(12).lean(),
    ProductModel.find({ isActive: true, archivedAt: null }).select({ name: 1, slug: 1, images: 1, variants: 1 }).sort({ createdAt: -1 }).limit(12).lean(),
    ProductModel.aggregate<{ _id: Types.ObjectId; name: string; slug: string; images: unknown[]; variants: unknown[]; units: number }>([
      { $match: { isActive: true, archivedAt: null } },
      { $lookup: { from: "orders", let: { productId: "$_id" }, pipeline: [
        { $match: { $expr: { $and: [ { $in: ["$orderStatus", ["READY", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP"]] }, { $in: ["$$productId", "$items.productId"] } ] } } },
        { $unwind: "$items" },
        { $match: { $expr: { $eq: ["$items.productId", "$$productId"] } } },
        { $group: { _id: null, units: { $sum: { $ifNull: ["$items.pickedQuantity", "$items.requestedQuantity"] } } } },
      ], as: "sales" } },
      { $set: { units: { $ifNull: [{ $first: "$sales.units" }, 0] } } },
      { $sort: { units: -1, createdAt: -1 } },
      { $limit: 12 },
      { $project: { name: 1, slug: 1, images: 1, variants: 1, units: 1 } },
    ]),
    BundleModel.find(activeNowFilter(now)).sort({ isFeatured: -1, createdAt: -1 }).limit(12).lean(),
  ]);
  return { banners, promotions, featuredProducts, newArrivals, bestSellers, bundles };
}
