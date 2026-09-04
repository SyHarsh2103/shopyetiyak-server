import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSalesReport } from "../src/modules/reports/report.service.js";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("Phase 16 sales reporting", () => {
  it("counts paid order value including customer-value prepayment", async () => {
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const storeId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const variantId = new Types.ObjectId();
    const createdAt = new Date("2026-08-10T12:00:00.000Z");

    await mongoose.connection.collection("payments").insertOne({
      _id: paymentId,
      storeId,
      status: "SUCCEEDED",
      refundedAmountMinor: 0,
      createdAt,
    });

    await mongoose.connection.collection("orders").insertOne({
      _id: orderId,
      paymentId,
      storeId,
      storeSnapshot: { name: "Test Store" },
      paymentStatus: "SUCCEEDED",
      orderStatus: "DELIVERED",
      fulfillmentType: "DELIVERY",
      pricing: { currency: "USD", subtotalMinor: 10000, discountMinor: 0, taxMinor: 0, deliveryFeeMinor: 0, prepaidAmountMinor: 2500, totalMinor: 7500 },
      fulfillmentPricing: { currency: "USD", subtotalMinor: 10000, discountMinor: 0, taxMinor: 0, deliveryFeeMinor: 0, prepaidAmountMinor: 2500, totalMinor: 7500 },
      items: [{ productId, variantId, productNameSnapshot: "Rice", skuSnapshot: "RICE-1", productTypeSnapshot: "PACKAGED", requestedQuantity: 1, fulfillmentStatus: "PICKED", finalLineMinor: 10000, fulfilledLineMinor: 10000 }],
      createdAt,
    });

    const result = await getSalesReport({ from: "2026-08-01", to: "2026-08-31", currency: "USD" });
    expect(result.summary.orders).toBe(1);
    expect(result.summary.grossSalesMinor).toBe(10000);
    expect(result.summary.netRevenueMinor).toBe(10000);
  });
});
