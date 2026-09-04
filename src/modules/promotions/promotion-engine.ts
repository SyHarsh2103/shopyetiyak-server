import { Types } from "mongoose";

import { CouponModel } from "../coupons/coupon.model.js";
import { CouponRedemptionModel } from "../coupons/coupon-redemption.model.js";
import { BundleModel } from "../bundles/bundle.model.js";
import { PromotionModel } from "./promotion.model.js";

export interface PromotionLine {
  productId: string;
  variantId: string;
  quantity: number;
  subtotalMinor: number;
  brandId: string | null;
  categoryIds: string[];
  collectionIds: string[];
}

export interface AppliedPromotion {
  id: string;
  name: string;
  type: string;
  discountMinor: number;
  stackableWithCoupons: boolean;
}

function activeDateFilter(now: Date) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
}

function idMatches(values: Types.ObjectId[], candidate: string | null): boolean {
  return Boolean(candidate && values.some((value) => value.toString() === candidate));
}

function eligibleSubtotal(promotion: {
  scope: string;
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  brandIds: Types.ObjectId[];
  collectionIds: Types.ObjectId[];
}, lines: PromotionLine[]): number {
  if (promotion.scope === "CART") return lines.reduce((sum, line) => sum + line.subtotalMinor, 0);
  return lines.reduce((sum, line) => {
    const matches =
      (promotion.scope === "PRODUCT" && idMatches(promotion.productIds, line.productId)) ||
      (promotion.scope === "BRAND" && idMatches(promotion.brandIds, line.brandId)) ||
      (promotion.scope === "CATEGORY" && line.categoryIds.some((id) => idMatches(promotion.categoryIds, id))) ||
      (promotion.scope === "COLLECTION" && line.collectionIds.some((id) => idMatches(promotion.collectionIds, id)));
    return sum + (matches ? line.subtotalMinor : 0);
  }, 0);
}

export async function quoteAutomaticPromotions(input: {
  storeId: string;
  currency: string;
  subtotalMinor: number;
  deliveryFeeMinor?: number;
  lines: PromotionLine[];
}): Promise<{ discountMinor: number; freeDelivery: boolean; promotions: AppliedPromotion[]; couponsStackable: boolean }> {
  const now = new Date();
  const promotions = await PromotionModel.find({
    ...activeDateFilter(now),
    currency: input.currency,
    minimumSubtotalMinor: { $lte: input.subtotalMinor },
    $or: [{ storeIds: { $size: 0 } }, { storeIds: new Types.ObjectId(input.storeId) }],
  }).sort({ priority: 1, createdAt: 1 }).lean();

  let discountMinor = 0;
  let freeDelivery = false;
  let couponsStackable = true;
  const applied: AppliedPromotion[] = [];

  for (const promotion of promotions) {
    const base = eligibleSubtotal(promotion, input.lines);
    if (promotion.type === "FREE_DELIVERY") {
      if (promotion.scope !== "CART" && base <= 0) continue;
      freeDelivery = true;
      applied.push({ id: promotion._id.toString(), name: promotion.name, type: promotion.type, discountMinor: 0, stackableWithCoupons: promotion.stackableWithCoupons });
      couponsStackable = couponsStackable && promotion.stackableWithCoupons;
      continue;
    }
    if (base <= 0) continue;
    let amount = promotion.type === "PERCENTAGE"
      ? Math.round(base * ((promotion.percentageBasisPoints ?? 0) / 10000))
      : promotion.fixedAmountMinor ?? 0;
    if (promotion.maximumDiscountMinor != null) amount = Math.min(amount, promotion.maximumDiscountMinor);
    amount = Math.min(amount, Math.max(0, input.subtotalMinor - discountMinor));
    if (amount <= 0) continue;
    discountMinor += amount;
    applied.push({ id: promotion._id.toString(), name: promotion.name, type: promotion.type, discountMinor: amount, stackableWithCoupons: promotion.stackableWithCoupons });
    couponsStackable = couponsStackable && promotion.stackableWithCoupons;
  }

  const bundles = await BundleModel.find({
    isActive: true,
    pricingMode: "FIXED",
    currency: input.currency,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).lean();

  for (const bundle of bundles) {
    const fixedPriceMinor = bundle.fixedPriceMinor ?? null;
    if (fixedPriceMinor === null) continue;
    let componentSubtotal = 0;
    let qualifies = true;
    for (const component of bundle.components) {
      const line = input.lines.find((entry) =>
        entry.productId === component.productId.toString() &&
        entry.variantId === component.variantId.toString() &&
        entry.quantity >= component.quantity
      );
      if (!line) { qualifies = false; break; }
      const unitPriceMinor = line.quantity > 0 ? line.subtotalMinor / line.quantity : 0;
      componentSubtotal += Math.round(unitPriceMinor * component.quantity);
    }
    if (!qualifies || componentSubtotal <= fixedPriceMinor) continue;
    const amount = Math.min(componentSubtotal - fixedPriceMinor, Math.max(0, input.subtotalMinor - discountMinor));
    if (amount <= 0) continue;
    discountMinor += amount;
    applied.push({
      id: bundle._id.toString(),
      name: bundle.name,
      type: "BUNDLE",
      discountMinor: amount,
      stackableWithCoupons: true,
    });
  }

  return { discountMinor, freeDelivery, promotions: applied, couponsStackable };
}

export async function quoteCoupon(input: {
  code: string;
  subtotalMinor: number;
  currency: string;
  storeId: string;
  customerId?: string;
  lines: PromotionLine[];
  promotionsStackable: boolean;
  hasPromotions: boolean;
}): Promise<{ code: string; valid: boolean; discountMinor: number; message: string }> {
  if (!input.code) return { code: "", valid: false, discountMinor: 0, message: "" };
  const coupon = await CouponModel.findOne({ code: input.code.toUpperCase() }).lean();
  const now = new Date();
  if (!coupon || !coupon.isActive) return { code: input.code, valid: false, discountMinor: 0, message: "Coupon code is not active." };
  if (coupon.startsAt && coupon.startsAt > now) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon is not active yet." };
  if (coupon.endsAt && coupon.endsAt < now) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon has expired." };
  if (coupon.storeIds.length && !coupon.storeIds.some((id) => id.toString() === input.storeId)) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon is not valid for this store." };
  if (coupon.currency !== input.currency) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon currency does not match this cart." };
  if (input.subtotalMinor < coupon.minimumSubtotalMinor) return { code: coupon.code, valid: false, discountMinor: 0, message: "Cart does not meet the coupon minimum spend." };
  if (input.hasPromotions && (!coupon.stackableWithPromotions || !input.promotionsStackable)) return { code: coupon.code, valid: false, discountMinor: 0, message: "This coupon cannot be combined with the active promotion." };

  if (coupon.usageLimit != null) {
    const usage = await CouponRedemptionModel.countDocuments({ couponId: coupon._id });
    if (usage >= coupon.usageLimit) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon usage limit has been reached." };
  }
  if (coupon.customerUsageLimit != null && input.customerId) {
    const usage = await CouponRedemptionModel.countDocuments({ couponId: coupon._id, customerId: new Types.ObjectId(input.customerId) });
    if (usage >= coupon.customerUsageLimit) return { code: coupon.code, valid: false, discountMinor: 0, message: "You have already used this coupon the maximum number of times." };
  }

  const targeted = coupon.productIds.length || coupon.categoryIds.length || coupon.brandIds.length || coupon.collectionIds.length;
  const eligible = targeted
    ? input.lines.reduce((sum, line) => {
        const match =
          idMatches(coupon.productIds, line.productId) ||
          idMatches(coupon.brandIds, line.brandId) ||
          line.categoryIds.some((id) => idMatches(coupon.categoryIds, id)) ||
          line.collectionIds.some((id) => idMatches(coupon.collectionIds, id));
        return sum + (match ? line.subtotalMinor : 0);
      }, 0)
    : input.subtotalMinor;
  if (eligible <= 0) return { code: coupon.code, valid: false, discountMinor: 0, message: "Coupon does not apply to items in this cart." };

  let discountMinor = coupon.discountType === "PERCENTAGE"
    ? Math.round(eligible * ((coupon.percentageBasisPoints ?? 0) / 10000))
    : coupon.fixedAmountMinor ?? 0;
  if (coupon.maximumDiscountMinor != null) discountMinor = Math.min(discountMinor, coupon.maximumDiscountMinor);
  discountMinor = Math.min(discountMinor, eligible);
  return { code: coupon.code, valid: true, discountMinor, message: "Coupon applied." };
}
