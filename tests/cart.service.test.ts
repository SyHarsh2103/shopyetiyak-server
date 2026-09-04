import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CartModel } from "../src/modules/carts/cart.model.js";
import {
  addCartItem,
  addCartItems,
  applyCartCoupon,
  getCartQuote,
} from "../src/modules/carts/cart.service.js";
import { CouponModel } from "../src/modules/coupons/coupon.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let mongo: MongoMemoryServer;
let storeId = "";
let productId = "";
let variantId = "";
const owner = { guestToken: "phase-seven-guest-token" };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const store = await StoreLocationModel.create({
    name: "Downtown Store",
    code: "DT7",
    address: {
      line1: "1 Market St",
      line2: "",
      city: "Jersey City",
      state: "NJ",
      postalCode: "07302",
      country: "USA",
    },
    timezone: "America/New_York",
    pickupEnabled: true,
    deliveryEnabled: true,
    status: "ACTIVE",
  });
  storeId = store.id;

  const product = await ProductModel.create({
    name: "Organic Tomatoes",
    slug: "phase7-organic-tomatoes",
    shortDescription: "Fresh tomatoes",
    description: "Fresh tomatoes for cart testing.",
    categoryIds: [],
    collectionIds: [],
    productType: "VARIABLE_WEIGHT",
    countryOfOrigin: "USA",
    variants: [{
      sku: "P7-TOMATO-LB",
      attributes: [{ name: "Size", value: "1 LB" }],
      pricing: {
        currency: "USD",
        costPriceMinor: 150,
        regularPriceMinor: 399,
        salePriceMinor: 299,
      },
      sellingUnit: "POUND",
      unitQuantity: 1,
      minimumQuantity: 1,
      maximumQuantity: 5,
      quantityIncrement: 0.25,
      status: "ACTIVE",
    }],
    isActive: true,
    archivedAt: null,
  });
  productId = product.id;
  const variant = product.variants[0];
  if (!variant) throw new Error("Variant missing.");
  variantId = variant._id.toString();

  await InventoryModel.create({
    storeId: store._id,
    productId: product._id,
    variantId: variant._id,
    quantityOnHand: 10,
    quantityReserved: 0,
    quantityAvailable: 10,
    reorderLevel: 2,
    reorderQuantity: 10,
  });

  await CouponModel.create({
    code: "SAVE10",
    discountType: "PERCENTAGE",
    percentageBasisPoints: 1000,
    currency: "USD",
    minimumSubtotalMinor: 100,
    isActive: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("cart service", () => {
  it("persists a guest cart and recalculates current price", async () => {
    const cart = await addCartItem(owner, { storeId, productId, variantId, quantity: 1.25 });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.lineSubtotalMinor).toBe(374);

    await ProductModel.updateOne(
      { _id: productId, "variants._id": variantId },
      { $set: { "variants.$.pricing.salePriceMinor": 279 } },
    );

    const refreshed = await getCartQuote(owner, storeId);
    expect(refreshed.items[0]?.product?.variant.pricing.currentPriceMinor).toBe(279);
    expect(refreshed.items[0]?.lineSubtotalMinor).toBe(349);
  });

  it("validates the full quantity before bulk additions", async () => {
    await expect(addCartItems(owner, storeId, [{ productId, variantId, quantity: 20 }])).rejects.toMatchObject({ code: "QUANTITY_ABOVE_MAXIMUM" });
    const cartCount = await CartModel.countDocuments();
    expect(cartCount).toBe(1);
  });

  it("applies a backend coupon to the current subtotal", async () => {
    const result = await applyCartCoupon(owner, storeId, "SAVE10");
    expect(result.coupon.valid).toBe(true);
    expect(result.totals.discountMinor).toBe(35);
  });
});
