import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
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
  adjustInventory,
  commitInventory,
  receiveBatch,
  releaseInventory,
  reserveInventory,
  transferInventory,
} from "../src/modules/inventory/inventory.service.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let replicaSet: MongoMemoryReplSet;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(
    Date.now() + days * DAY_MS,
  );
}

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

async function seedContext() {
  const [
    sourceStore,
    targetStore,
  ] = await StoreLocationModel.create([
    {
      name: "Downtown",
      code: "DT",
      address: {
        line1: "1 Main St",
        city: "Jersey City",
        state: "NJ",
        postalCode: "07302",
        country: "USA",
      },
      timezone: "America/New_York",
    },
    {
      name: "Uptown",
      code: "UP",
      address: {
        line1: "2 Main St",
        city: "Jersey City",
        state: "NJ",
        postalCode: "07307",
        country: "USA",
      },
      timezone: "America/New_York",
    },
  ]);

  if (
    !sourceStore ||
    !targetStore
  ) {
    throw new Error(
      "Stores were not created.",
    );
  }

  const product =
    await ProductModel.create({
      name: "Test Rice",
      slug: "test-rice",
      productType: "PACKAGED",
      variants: [
        {
          sku: "RICE-5KG",
          pricing: {
            currency: "USD",
            costPriceMinor: 1000,
            regularPriceMinor: 1500,
            salePriceMinor: null,
          },
          sellingUnit: "BAG",
          unitQuantity: 1,
          minimumQuantity: 1,
          maximumQuantity: null,
          quantityIncrement: 1,
          status: "ACTIVE",
        },
      ],
    });

  const variant =
    product.variants[0];

  if (!variant) {
    throw new Error(
      "Product variant was not created.",
    );
  }

  return {
    sourceStoreId:
      sourceStore.id,
    targetStoreId:
      targetStore.id,
    productId:
      product.id,
    variantId:
      variant._id.toString(),
  };
}

describe(
  "inventory service",
  () => {
    it(
      "keeps stock traceable, prevents overselling, and consumes batches FEFO",
      async () => {
        const context =
          await seedContext();

        await receiveBatch({
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          batchNumber: "LATE",
          receivedDate:
            daysFromNow(-10),
          manufacturingDate: null,
          expiryDate:
            daysFromNow(60),
          receivedQuantity: 5,
          costPriceMinor: 900,
          supplierId: null,
          supplierName: "",
          note: "Late batch",
        });

        await receiveBatch({
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          batchNumber: "EARLY",
          receivedDate:
            daysFromNow(-9),
          manufacturingDate: null,
          expiryDate:
            daysFromNow(30),
          receivedQuantity: 5,
          costPriceMinor: 950,
          supplierId: null,
          supplierName: "",
          note: "Early batch",
        });

        const reservation = {
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          quantity: 6,
          referenceType:
            "TEST_ORDER",
          referenceId:
            "ORDER-1",
          note:
            "Concurrency test",
        };

        const concurrent =
          await Promise.allSettled([
            reserveInventory(
              reservation,
            ),
            reserveInventory(
              reservation,
            ),
          ]);

        expect(
          concurrent.filter(
            (result) =>
              result.status ===
              "fulfilled",
          ),
        ).toHaveLength(1);

        expect(
          concurrent.filter(
            (result) =>
              result.status ===
              "rejected",
          ),
        ).toHaveLength(1);

        await commitInventory(
          reservation,
        );

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
        ).toBe(0);

        expect(
          late?.remainingQuantity,
        ).toBe(4);

        await transferInventory({
          sourceStoreId:
            context.sourceStoreId,
          targetStoreId:
            context.targetStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          quantity: 2,
          note: "Move stock",
        });

        await adjustInventory({
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          operation: "DECREASE",
          quantity: 1,
          transactionType:
            "DAMAGED",
          reason: "DAMAGED",
          batchId: null,
          note:
            "Damaged package",
        });

        const source =
          await InventoryModel.findOne(
            {
              storeId:
                context.sourceStoreId,
            },
          ).lean();

        const target =
          await InventoryModel.findOne(
            {
              storeId:
                context.targetStoreId,
            },
          ).lean();

        expect(source).toMatchObject(
          {
            quantityOnHand: 1,
            quantityReserved: 0,
            quantityAvailable: 1,
          },
        );

        expect(target).toMatchObject(
          {
            quantityOnHand: 2,
            quantityReserved: 0,
            quantityAvailable: 2,
          },
        );

        const targetBatch =
          await InventoryBatchModel.findOne(
            {
              storeId:
                context.targetStoreId,
              batchNumber:
                "LATE",
            },
          ).lean();

        expect(
          targetBatch?.remainingQuantity,
        ).toBe(2);

        const types = (
          await InventoryTransactionModel.find()
            .sort({
              createdAt: 1,
            })
            .lean()
        ).map(
          (entry) => entry.type,
        );

        expect(types).toEqual([
          "PURCHASE_RECEIPT",
          "PURCHASE_RECEIPT",
          "ORDER_RESERVATION",
          "ORDER_COMMIT",
          "TRANSFER_OUT",
          "TRANSFER_IN",
          "DAMAGED",
        ]);
      },
    );

    it(
      "releases reserved stock without changing on-hand quantity",
      async () => {
        const context =
          await seedContext();

        await receiveBatch({
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          batchNumber: "ONE",
          receivedDate:
            daysFromNow(-5),
          manufacturingDate: null,
          expiryDate: null,
          receivedQuantity: 4,
          costPriceMinor: 900,
          supplierId: null,
          supplierName: "",
          note: "",
        });

        const reservation = {
          storeId:
            context.sourceStoreId,
          productId:
            context.productId,
          variantId:
            context.variantId,
          quantity: 2,
          referenceType:
            "TEST_ORDER",
          referenceId:
            "ORDER-3",
          note: "",
        };

        await reserveInventory(
          reservation,
        );

        const released =
          await releaseInventory(
            reservation,
          );

        expect(
          released,
        ).toMatchObject({
          quantityOnHand: 4,
          quantityReserved: 0,
          quantityAvailable: 4,
        });
      },
    );
  },
);