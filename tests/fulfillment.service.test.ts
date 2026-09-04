import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { InventoryBatchModel } from "../src/modules/inventory/inventory-batch.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { InventoryTransactionModel } from "../src/modules/inventory/inventory-transaction.model.js";
import {
  receiveBatch,
  reserveInventory,
} from "../src/modules/inventory/inventory.service.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { cancelOrderRecord } from "../src/modules/orders/order.service.js";
import {
  PackingService,
  type FulfillmentPaymentActions,
} from "../src/modules/packing/packing.service.js";
import { PaymentModel } from "../src/modules/payments/payment.model.js";
import {
  completePicking,
  markOrderItemPicked,
  markOrderItemUnavailable,
  startPicking,
} from "../src/modules/picking/picking.service.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let replicaSet: MongoMemoryReplSet;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(
    Date.now() + days * DAY_MS,
  );
}

const actor = {
  adminUserId:
    new Types.ObjectId().toString(),
  roleNames: ["SUPER_ADMIN"],
};

beforeAll(async () => {
  replicaSet =
    await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
      },
    });

  await mongoose.connect(
    replicaSet.getUri(),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function seedVariableOrder() {
  const store =
    await StoreLocationModel.create({
      name: "Fulfillment Store",
      code: "FUL",
      address: {
        line1: "10 Picker Way",
        city: "Jersey City",
        state: "NJ",
        postalCode: "07302",
        country: "USA",
      },
      timezone:
        "America/New_York",
      pickupEnabled: true,
      deliveryEnabled: true,
      status: "ACTIVE",
    });

  const product =
    await ProductModel.create({
      name: "Variable Tomatoes",
      slug: "variable-tomatoes",
      productType:
        "VARIABLE_WEIGHT",
      taxClassification:
        "GROCERY",
      categoryIds: [],
      collectionIds: [],
      variants: [
        {
          sku: "TOMATO-LB",
          pricing: {
            currency: "USD",
            costPriceMinor: 250,
            regularPriceMinor: 500,
            salePriceMinor: null,
          },
          sellingUnit: "POUND",
          unitQuantity: 1,
          minimumQuantity: 0.5,
          maximumQuantity: 10,
          quantityIncrement: 0.25,
          status: "ACTIVE",
        },
      ],
      isActive: true,
      archivedAt: null,
    });

  const variant =
    product.variants[0];

  if (!variant) {
    throw new Error(
      "Variant missing.",
    );
  }

  await receiveBatch({
    storeId: store.id,
    productId: product.id,
    variantId:
      variant._id.toString(),
    batchNumber: "LATE",
    receivedDate:
      daysFromNow(-10),
    manufacturingDate: null,
    expiryDate:
      daysFromNow(60),
    receivedQuantity: 5,
    costPriceMinor: 250,
    supplierId: null,
    supplierName: "",
    note: "",
  });

  await receiveBatch({
    storeId: store.id,
    productId: product.id,
    variantId:
      variant._id.toString(),
    batchNumber: "EARLY",
    receivedDate:
      daysFromNow(-9),
    manufacturingDate: null,
    expiryDate:
      daysFromNow(30),
    receivedQuantity: 5,
    costPriceMinor: 250,
    supplierId: null,
    supplierName: "",
    note: "",
  });

  const payment =
    await PaymentModel.create({
      customerId: null,
      guestTokenHash:
        "fulfillment-guest",
      storeId: store._id,
      provider: "STRIPE",
      providerPaymentIntentId:
        "pi_phase10_test",
      checkoutFingerprint:
        "f".repeat(64),
      currency: "USD",
      amountMinor: 1000,
      authorizedAmountMinor: 1000,
      capturedAmountMinor: 0,
      refundedAmountMinor: 0,
      captureMethod: "MANUAL",
      status: "AUTHORIZED",
      customerEmail:
        "picker@example.com",
      fulfillmentType: "PICKUP",
    });

  const order =
    await OrderModel.create({
      orderNumber:
        `GR-20260813-${new Types.ObjectId()
          .toString()
          .slice(-8)
          .toUpperCase()}`,
      customerId: null,
      guestTokenHash:
        "fulfillment-guest",
      guestCustomer: {
        firstName: "Pick",
        lastName: "Test",
        email:
          "picker@example.com",
        phone: "555-0100",
      },
      contactSnapshot: {
        firstName: "Pick",
        lastName: "Test",
        email:
          "picker@example.com",
        phone: "555-0100",
      },
      storeId: store._id,
      storeSnapshot: {
        storeId: store._id,
        name: store.name,
        code: store.code,
        timezone:
          store.timezone,
      },
      paymentId: payment._id,
      fulfillmentType: "PICKUP",
      items: [
        {
          productId:
            product._id,
          variantId:
            variant._id,
          productNameSnapshot:
            product.name,
          productSlugSnapshot:
            product.slug,
          skuSnapshot:
            variant.sku,
          productTypeSnapshot:
            "VARIABLE_WEIGHT",
          sellingUnitSnapshot:
            variant.sellingUnit,
          unitQuantitySnapshot: 1,
          attributesSnapshot: [],
          imageSnapshot: null,
          requestedQuantity: 2,
          requestedWeight: 2,
          actualWeight: null,
          pickedQuantity: null,
          reservedQuantity: 2,
          unitPriceMinor: 500,
          lineSubtotalMinor: 1000,
          discountMinor: 0,
          taxMinor: 0,
          finalLineMinor: 1000,
          fulfillmentStatus:
            "PENDING",
          inventoryFulfillmentStatus:
            "RESERVED",
          substitutionPreference:
            "BEST_AVAILABLE",
        },
      ],
      pricing: {
        currency: "USD",
        subtotalMinor: 1000,
        discountMinor: 0,
        taxMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 1000,
      },
      couponSnapshot: {
        code: "",
        discountMinor: 0,
      },
      taxLinesSnapshot: [
        {
          productId:
            product._id,
          variantId:
            variant._id,
          taxableAmountMinor: 1000,
          taxMinor: 0,
          rateBasisPoints: 0,
          ruleId: null,
        },
      ],
      paymentStatus:
        "AUTHORIZED",
      orderStatus:
        "PAYMENT_AUTHORIZED",
      inventoryReservationStatus:
        "ACTIVE",
      customerNotes: "",
    });

  payment.orderId =
    order._id;

  await payment.save();

  await reserveInventory({
    storeId: store.id,
    productId: product.id,
    variantId:
      variant._id.toString(),
    quantity: 2,
    referenceType: "ORDER",
    referenceId: order.id,
    note:
      "Phase 10 reservation",
  });

  return {
    store,
    product,
    variant,
    payment,
    order,
  };
}

describe(
  "Phase 10 fulfillment service",
  () => {
    it(
      "records variable actual weight, settles manual capture, and commits FEFO inventory",
      async () => {
        const seeded =
          await seedVariableOrder();

        let detail =
          await startPicking(
            seeded.order.id,
            actor,
          );

        expect(
          detail.orderStatus,
        ).toBe("PICKING");

        const item =
          detail.items[0];

        if (!item) {
          throw new Error(
            "Order item missing.",
          );
        }

        detail =
          await markOrderItemPicked(
            seeded.order.id,
            item.id,
            {
              actualWeight: 1.5,
              batchId: null,
            },
            actor,
          );

        expect(
          detail.items[0]
            ?.actualWeight,
        ).toBe(1.5);

        expect(
          detail.fulfillmentPricing
            .totalMinor,
        ).toBe(750);

        const inventoryAfterWeight =
          await InventoryModel.findOne(
            {
              storeId:
                seeded.store._id,
            },
          ).lean();

        expect(
          inventoryAfterWeight
            ?.quantityReserved,
        ).toBe(1.5);

        expect(
          inventoryAfterWeight
            ?.quantityAvailable,
        ).toBe(8.5);

        detail =
          await completePicking(
            seeded.order.id,
            actor,
            "Weight confirmed",
          );

        expect(
          detail.orderStatus,
        ).toBe("PACKING");

        const fakePayments: FulfillmentPaymentActions =
          {
            capturePayment(
              paymentId,
              input,
            ) {
              return PaymentModel.findByIdAndUpdate(
                paymentId,
                {
                  $set: {
                    status:
                      "SUCCEEDED",
                    capturedAmountMinor:
                      input.amountMinor ??
                      0,
                  },
                },
                {
                  returnDocument:
                    "after",
                },
              ).then(
                () => undefined,
              );
            },

            refundPayment() {
              return Promise.resolve(
                undefined,
              );
            },
          };

        const packing =
          new PackingService(
            fakePayments,
          );

        detail =
          await packing.completePacking(
            seeded.order.id,
            {
              bagCount: 1,
              notes:
                "Produce bag",
            },
            actor,
          );

        expect(
          detail.orderStatus,
        ).toBe(
          "READY_FOR_PICKUP",
        );

        expect(
          detail.inventoryReservationStatus,
        ).toBe("COMMITTED");

        expect(
          detail.packing.bagCount,
        ).toBe(1);

        const inventory =
          await InventoryModel.findOne(
            {
              storeId:
                seeded.store._id,
            },
          ).lean();

        expect(
          inventory,
        ).toMatchObject({
          quantityOnHand: 8.5,
          quantityReserved: 0,
          quantityAvailable: 8.5,
        });

        const early =
          await InventoryBatchModel.findOne(
            {
              batchNumber:
                "EARLY",
            },
          ).lean();

        const late =
          await InventoryBatchModel.findOne(
            {
              batchNumber:
                "LATE",
            },
          ).lean();

        expect(
          early?.remainingQuantity,
        ).toBe(3.5);

        expect(
          late?.remainingQuantity,
        ).toBe(5);

        expect(
          await InventoryTransactionModel.countDocuments(
            {
              type:
                "ORDER_COMMIT",
              referenceId:
                seeded.order.id,
            },
          ),
        ).toBe(1);
      },
    );

    it(
      "releases reservation when a picker marks an item unavailable",
      async () => {
        const seeded =
          await seedVariableOrder();

        const started =
          await startPicking(
            seeded.order.id,
            actor,
          );

        const item =
          started.items[0];

        if (!item) {
          throw new Error(
            "Order item missing.",
          );
        }

        const detail =
          await markOrderItemUnavailable(
            seeded.order.id,
            item.id,
            {
              reason:
                "No sellable produce remained",
            },
            actor,
          );

        expect(
          detail.items[0]
            ?.fulfillmentStatus,
        ).toBe("UNAVAILABLE");

        expect(
          detail.items[0]
            ?.inventoryFulfillmentStatus,
        ).toBe("RELEASED");

        expect(
          detail.fulfillmentPricing
            .totalMinor,
        ).toBe(0);

        const inventory =
          await InventoryModel.findOne(
            {
              storeId:
                seeded.store._id,
            },
          ).lean();

        expect(
          inventory,
        ).toMatchObject({
          quantityOnHand: 10,
          quantityReserved: 0,
          quantityAvailable: 10,
        });

        expect(
          await InventoryTransactionModel.countDocuments(
            {
              type:
                "ORDER_RELEASE",
              referenceId:
                seeded.order.id,
            },
          ),
        ).toBe(1);
      },
    );

    it(
      "releases the adjusted active reservation when cancelling during picking",
      async () => {
        const seeded =
          await seedVariableOrder();

        const started =
          await startPicking(
            seeded.order.id,
            actor,
          );

        const item =
          started.items[0];

        if (!item) {
          throw new Error(
            "Order item missing.",
          );
        }

        await markOrderItemPicked(
          seeded.order.id,
          item.id,
          {
            actualWeight: 1.25,
            batchId: null,
          },
          actor,
        );

        const cancelled =
          await cancelOrderRecord(
            seeded.order.id,
            {
              actorType: "ADMIN",
              actorId:
                actor.adminUserId,
              roleNames:
                actor.roleNames,
            },
            "Cancelled during picking",
          );

        expect(
          cancelled.orderStatus,
        ).toBe("CANCELLED");

        expect(
          cancelled.inventoryReservationStatus,
        ).toBe("RELEASED");

        const inventory =
          await InventoryModel.findOne(
            {
              storeId:
                seeded.store._id,
            },
          ).lean();

        expect(
          inventory,
        ).toMatchObject({
          quantityOnHand: 10,
          quantityReserved: 0,
          quantityAvailable: 10,
        });
      },
    );
  },
);