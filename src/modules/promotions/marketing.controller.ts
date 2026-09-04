import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { bannerInputSchema, bannerUpdateSchema } from "../banners/banner.validation.js";
import { bundleInputSchema, bundleUpdateSchema } from "../bundles/bundle.validation.js";
import { promotionInputSchema, promotionUpdateSchema } from "./promotion.validation.js";
import { couponInputSchema, couponUpdateSchema, marketingIdParamSchema } from "./marketing.validation.js";
import {
  createBanner, createBundle, createCoupon, createPromotion,
  listBanners, listBundles, listCoupons, listPromotions, publicMarketing,
  updateBanner, updateBundle, updateCoupon, updatePromotion,
} from "./marketing.service.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  return req.auth;
}

async function audited(req: Request, action: string, entityType: string, entityId: string, after: unknown) {
  const identity = admin(req);
  await writeAudit({ actorType: "ADMIN", actorId: identity.adminUserId, actorRoleNames: identity.roleNames, action, entityType, entityId, after, request: req });
}

export async function getPromotions(req: Request, res: Response) { admin(req); res.status(200).json({ success: true, data: { promotions: await listPromotions() } }); }
export async function postPromotion(req: Request, res: Response) { const input = promotionInputSchema.parse(req.body); const record = await createPromotion(input); await audited(req, "PROMOTION_CREATED", "Promotion", record.id, input); res.status(201).json({ success: true, data: { promotion: record } }); }
export async function patchPromotion(req: Request, res: Response) { const { id } = marketingIdParamSchema.parse(req.params); const input = promotionUpdateSchema.parse(req.body); const record = await updatePromotion(id, input); await audited(req, "PROMOTION_UPDATED", "Promotion", id, input); res.status(200).json({ success: true, data: { promotion: record } }); }

export async function getCoupons(req: Request, res: Response) { admin(req); res.status(200).json({ success: true, data: { coupons: await listCoupons() } }); }
export async function postCoupon(req: Request, res: Response) { const input = couponInputSchema.parse(req.body); const record = await createCoupon(input); await audited(req, "COUPON_CREATED", "Coupon", record.id, input); res.status(201).json({ success: true, data: { coupon: record } }); }
export async function patchCoupon(req: Request, res: Response) { const { id } = marketingIdParamSchema.parse(req.params); const input = couponUpdateSchema.parse(req.body); const record = await updateCoupon(id, input); await audited(req, "COUPON_UPDATED", "Coupon", id, input); res.status(200).json({ success: true, data: { coupon: record } }); }

export async function getBanners(req: Request, res: Response) { admin(req); res.status(200).json({ success: true, data: { banners: await listBanners() } }); }
export async function postBanner(req: Request, res: Response) { const input = bannerInputSchema.parse(req.body); const record = await createBanner(input); await audited(req, "BANNER_CREATED", "Banner", record.id, input); res.status(201).json({ success: true, data: { banner: record } }); }
export async function patchBanner(req: Request, res: Response) { const { id } = marketingIdParamSchema.parse(req.params); const input = bannerUpdateSchema.parse(req.body); const record = await updateBanner(id, input); await audited(req, "BANNER_UPDATED", "Banner", id, input); res.status(200).json({ success: true, data: { banner: record } }); }

export async function getBundles(req: Request, res: Response) { admin(req); res.status(200).json({ success: true, data: { bundles: await listBundles() } }); }
export async function postBundle(req: Request, res: Response) { const input = bundleInputSchema.parse(req.body); const record = await createBundle(input); await audited(req, "BUNDLE_CREATED", "Bundle", record.id, input); res.status(201).json({ success: true, data: { bundle: record } }); }
export async function patchBundle(req: Request, res: Response) { const { id } = marketingIdParamSchema.parse(req.params); const input = bundleUpdateSchema.parse(req.body); const record = await updateBundle(id, input); await audited(req, "BUNDLE_UPDATED", "Bundle", id, input); res.status(200).json({ success: true, data: { bundle: record } }); }

export async function getPublicMarketing(req: Request, res: Response) { const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined; res.status(200).json({ success: true, data: await publicMarketing(storeId) }); }
