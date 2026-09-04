import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CouponModel } from "../src/modules/coupons/coupon.model.js";
import { PromotionModel } from "../src/modules/promotions/promotion.model.js";
import { quoteAutomaticPromotions, quoteCoupon } from "../src/modules/promotions/promotion-engine.js";

let mongo: MongoMemoryServer;
const storeId = new mongoose.Types.ObjectId().toString();
const productId = new mongoose.Types.ObjectId().toString();
const categoryId = new mongoose.Types.ObjectId().toString();
const lines = [{ productId, variantId: new mongoose.Types.ObjectId().toString(), quantity: 2, subtotalMinor: 2000, brandId: null, categoryIds: [categoryId], collectionIds: [] }];

beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
beforeEach(async () => { await Promise.all([PromotionModel.deleteMany({}), CouponModel.deleteMany({})]); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

describe("Phase 12 promotion engine", () => {
  it("applies an active targeted percentage promotion", async () => {
    await PromotionModel.create({ name: "Produce 10", slug: "produce-10", type: "PERCENTAGE", scope: "CATEGORY", percentageBasisPoints: 1000, currency: "USD", categoryIds: [categoryId], isActive: true });
    const quote = await quoteAutomaticPromotions({ storeId, currency: "USD", subtotalMinor: 2000, lines });
    expect(quote.discountMinor).toBe(200);
    expect(quote.promotions).toHaveLength(1);
  });

  it("applies a coupon after automatic promotion pricing", async () => {
    await CouponModel.create({ code: "SAVE5", discountType: "FIXED", fixedAmountMinor: 500, currency: "USD", minimumSubtotalMinor: 0, isActive: true });
    const quote = await quoteCoupon({ code: "SAVE5", subtotalMinor: 1800, currency: "USD", storeId, lines, promotionsStackable: true, hasPromotions: false });
    expect(quote.valid).toBe(true);
    expect(quote.discountMinor).toBe(500);
  });
});
