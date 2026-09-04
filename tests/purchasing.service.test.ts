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

import { GoodsReceiptModel } from "../src/modules/purchasing/goods-receipt.model.js";
import { PurchaseOrderModel } from "../src/modules/purchasing/purchase-order.model.js";
import {
  createPurchaseOrder,
  createSupplierReturn,
  receiveGoods,
  transitionPurchaseOrder,
} from "../src/modules/purchasing/purchasing.service.js";
import { SupplierReturnModel } from "../src/modules/purchasing/supplier-return.model.js";
import { InventoryBatchModel } from "../src/modules/inventory/inventory-batch.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { InventoryTransactionModel } from "../src/modules/inventory/inventory-transaction.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";
import { SupplierModel } from "../src/modules/suppliers/supplier.model.js";
import { SupplierProductModel } from "../src/modules/suppliers/supplier-product.model.js";

let replicaSet: MongoMemoryReplSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function seedContext() {
  const supplier = await SupplierModel.create({
    companyName: "Fresh Foods Supply",
    contactPerson: "Sam Supplier",
    email: "supplier@example.com",
    status: "ACTIVE",
  });
  const store = await StoreLocationModel.create({
    name: "Downtown",
    code: "DT",
    address: { line1: "1 Main St", city: "Jersey City", state: "NJ", postalCode: "07302", country: "USA" },
    timezone: "America/New_York",
    status: "ACTIVE",
  });
  const product = await ProductModel.create({
    name: "Basmati Rice",
    slug: "basmati-rice",
    productType: "PACKAGED",
    variants: [{
      sku: "RICE-5KG",
      pricing: { currency: "USD", costPriceMinor: 900, regularPriceMinor: 1500, salePriceMinor: null },
      sellingUnit: "BAG",
      unitQuantity: 1,
      minimumQuantity: 1,
      maximumQuantity: null,
      quantityIncrement: 1,
      status: "ACTIVE",
    }],
  });
  const variant = product.variants[0];
  if (!variant) throw new Error("Variant was not created.");
  await SupplierProductModel.create({
    supplierId: supplier._id,
    productId: product._id,
    variantId: variant._id,
    supplierSku: "SUP-RICE-5",
    currency: "USD",
    unitCostMinor: 850,
    minimumOrderQuantity: 1,
    leadTimeDays: 2,
    isPreferred: true,
    isActive: true,
  });
  return {
    supplierId: supplier.id,
    storeId: store.id,
    productId: product.id,
    variantId: variant._id.toString(),
  };
}

describe("purchasing service", () => {
  it("supports PO workflow, partial receiving, inventory batches, cost tracking, and supplier returns", async () => {
    const context = await seedContext();
    const order = await createPurchaseOrder({
      supplierId: context.supplierId,
      storeId: context.storeId,
      currency: "USD",
      items: [{
        productId: context.productId,
        variantId: context.variantId,
        orderedQuantity: 10,
        unitCostMinor: 850,
      }],
      expectedDeliveryDate: null,
      notes: "Initial order",
    });
    const orderItem = order.items[0];
    if (!orderItem) throw new Error("PO item was not created.");

    await transitionPurchaseOrder(order.id, { status: "APPROVED", note: "Approved" });
    await transitionPurchaseOrder(order.id, { status: "SENT", note: "Sent to supplier" });

    const firstReceipt = await receiveGoods({
      purchaseOrderId: order.id,
      receivedAt: new Date("2026-08-12T12:00:00.000Z"),
      items: [{
        purchaseOrderItemId: orderItem._id.toString(),
        batchNumber: "LOT-001",
        quantityReceived: 6,
        damagedQuantity: 1,
        unitCostMinor: 860,
        manufacturingDate: new Date("2026-08-01T00:00:00.000Z"),
        expiryDate: new Date("2027-08-01T00:00:00.000Z"),
      }],
      notes: "One damaged bag",
    });
    expect(firstReceipt.purchaseOrder.status).toBe("PARTIALLY_RECEIVED");
    expect(firstReceipt.purchaseOrder.items[0]?.receivedQuantity).toBe(5);

    const secondReceipt = await receiveGoods({
      purchaseOrderId: order.id,
      receivedAt: new Date("2026-08-13T12:00:00.000Z"),
      items: [{
        purchaseOrderItemId: orderItem._id.toString(),
        batchNumber: "LOT-002",
        quantityReceived: 5,
        damagedQuantity: 0,
        unitCostMinor: 840,
        manufacturingDate: new Date("2026-08-02T00:00:00.000Z"),
        expiryDate: new Date("2027-09-01T00:00:00.000Z"),
      }],
      notes: "Final receipt",
    });
    expect(secondReceipt.purchaseOrder.status).toBe("RECEIVED");
    expect(secondReceipt.purchaseOrder.items[0]?.receivedQuantity).toBe(10);

    const inventory = await InventoryModel.findOne({ storeId: context.storeId }).lean();
    expect(inventory).toMatchObject({ quantityOnHand: 10, quantityReserved: 0, quantityAvailable: 10 });
    expect(await GoodsReceiptModel.countDocuments()).toBe(2);

    const batches = await InventoryBatchModel.find({ storeId: context.storeId }).sort({ batchNumber: 1 }).lean();
    expect(batches).toHaveLength(2);
    expect(batches[0]?.remainingQuantity).toBe(5);
    expect(batches[1]?.remainingQuantity).toBe(5);

    const supplierProduct = await SupplierProductModel.findOne({ supplierId: context.supplierId }).lean();
    expect(supplierProduct?.lastReceivedCostMinor).toBe(840);

    const firstBatch = batches[0];
    if (!firstBatch) throw new Error("First batch was not created.");
    const supplierReturn = await createSupplierReturn({
      supplierId: context.supplierId,
      storeId: context.storeId,
      purchaseOrderId: order.id,
      goodsReceiptId: firstReceipt.receipt.id,
      items: [{ batchId: firstBatch._id.toString(), quantity: 2, reason: "Supplier quality issue" }],
      notes: "Return two bags",
    });
    expect(supplierReturn.totalValueMinor).toBe(1720);
    expect(await SupplierReturnModel.countDocuments()).toBe(1);

    const afterReturn = await InventoryModel.findOne({ storeId: context.storeId }).lean();
    expect(afterReturn).toMatchObject({ quantityOnHand: 8, quantityReserved: 0, quantityAvailable: 8 });
    const transactionTypes = (await InventoryTransactionModel.find().sort({ createdAt: 1 }).lean()).map((entry) => entry.type);
    expect(transactionTypes).toEqual(["PURCHASE_RECEIPT", "PURCHASE_RECEIPT", "SUPPLIER_RETURN"]);

    const storedOrder = await PurchaseOrderModel.findById(order.id).lean();
    expect(storedOrder?.status).toBe("RECEIVED");
  });
});
