import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { addCartItem } from "../src/modules/carts/cart.service.js";
import { buildCheckoutReview } from "../src/modules/checkout/checkout.service.js";
import { DeliverySlotModel } from "../src/modules/delivery/delivery-slot.model.js";
import { DeliveryZoneModel } from "../src/modules/delivery/delivery-zone.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";
import { TaxRuleModel } from "../src/modules/taxes/tax-rule.model.js";

let mongo: MongoMemoryServer;
let storeId = "";
let productId = "";
let variantId = "";
let deliverySlotId = "";

const owner = {
  guestToken: "checkout-guest-token",
};

beforeAll(async () => {
  mongo =
    await MongoMemoryServer.create();

  await mongoose.connect(
    mongo.getUri(),
  );

  const store =
    await StoreLocationModel.create({
      name: "Checkout Store",
      code: "CK7",
      address: {
        line1: "2 Main St",
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

  const zone =
    await DeliveryZoneModel.create({
      storeId: store._id,
      name: "Jersey City",
      postalCodes: ["07302"],
      minimumOrderMinor: 0,
      deliveryFeeMinor: 499,
      freeDeliveryThresholdMinor:
        2000,
      availableDays: [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
      ],
      status: "ACTIVE",
    });

  const slot =
    await DeliverySlotModel.create({
      storeId: store._id,
      zoneId: zone._id,
      date: "2099-01-02",
      startTime: "09:00",
      endTime: "11:00",
      timezone: store.timezone,
      capacity: 10,
      bookedCount: 0,
      cutoffMinutes: 120,
      cutoffAt: new Date(
        "2099-01-02T12:00:00.000Z",
      ),
      status: "ACTIVE",
    });

  deliverySlotId = slot.id;

  const product =
    await ProductModel.create({
      name: "Milk",
      slug: "phase7-milk",
      shortDescription:
        "Whole milk",
      description:
        "Whole milk.",
      categoryIds: [],
      collectionIds: [],
      productType: "PACKAGED",
      taxClassification:
        "GROCERY",
      variants: [
        {
          sku: "P7-MILK",
          attributes: [],
          pricing: {
            currency: "USD",
            costPriceMinor: 200,
            regularPriceMinor: 499,
            salePriceMinor: null,
          },
          sellingUnit: "BOTTLE",
          unitQuantity: 1,
          minimumQuantity: 1,
          maximumQuantity: 10,
          quantityIncrement: 1,
          status: "ACTIVE",
        },
      ],
      isActive: true,
      archivedAt: null,
    });

  productId = product.id;

  const variant =
    product.variants[0];

  if (!variant) {
    throw new Error(
      "Variant missing.",
    );
  }

  variantId =
    variant._id.toString();

  await InventoryModel.create({
    storeId: store._id,
    productId: product._id,
    variantId: variant._id,
    quantityOnHand: 8,
    quantityReserved: 0,
    quantityAvailable: 8,
    reorderLevel: 2,
    reorderQuantity: 8,
  });

  await TaxRuleModel.create({
    name:
      "NJ Grocery Test Tax",
    country: "USA",
    state: "NJ",
    taxClassification:
      "GROCERY",
    rateBasisPoints: 700,
    isActive: true,
  });

  await addCartItem(
    owner,
    {
      storeId,
      productId,
      variantId,
      quantity: 2,
    },
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe(
  "checkout foundation",
  () => {
    it(
      "creates a guest delivery review without creating payment or order records",
      async () => {
        const review =
          await buildCheckoutReview(
            owner,
            {
              storeId,
              fulfillmentType:
                "DELIVERY",
              deliverySlotId,

              guest: {
                firstName:
                  "Asha",
                lastName:
                  "Shah",
                email:
                  "asha@example.com",
                phone:
                  "555-0100",
              },

              deliveryAddress: {
                recipientName:
                  "Asha Shah",
                phone:
                  "555-0100",
                line1:
                  "1 Grove Street",
                line2: "",
                city:
                  "Jersey City",
                state: "NJ",
                postalCode:
                  "07302",
                country:
                  "USA",
                deliveryInstructions:
                  "",
              },

              customerNotes:
                "Leave at front desk",
            },
          );

        expect(
          review.identity.kind,
        ).toBe("GUEST");

        expect(
          review.totals
            .subtotalMinor,
        ).toBe(998);

        expect(
          review.tax.status,
        ).toBe(
          "CONFIGURED",
        );

        expect(
          review.totals
            .taxMinor,
        ).toBe(70);

        expect(
          review.totals
            .deliveryFeeMinor,
        ).toBe(499);

        expect(
          review.fulfillment
            .slot.selected?.id,
        ).toBe(
          deliverySlotId,
        );

        expect(
          review.payment.status,
        ).toBe(
          "READY_FOR_PAYMENT",
        );

        expect(
          review.payment
            .readyForPayment,
        ).toBe(true);

        expect(
          review.payment
            .captureMethod,
        ).toBe(
          "AUTOMATIC",
        );
      },
    );
  },
);