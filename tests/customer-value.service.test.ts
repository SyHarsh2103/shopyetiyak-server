import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GiftCardModel } from "../src/modules/customer-value/gift-card.model.js";
import { LoyaltyAccountModel } from "../src/modules/customer-value/loyalty-account.model.js";
import { StoreCreditAccountModel } from "../src/modules/customer-value/store-credit-account.model.js";
import {
  checkGiftCard,
  createGiftCard,
  getCustomerValueSummary,
  quoteValueRedemptions,
} from "../src/modules/customer-value/customer-value.service.js";
import { CustomerModel } from "../src/modules/customers/customer.model.js";

let mongo: MongoMemoryServer;
let customerId = "";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const customer = await CustomerModel.create({
    email: "phase15@example.com",
    passwordHash: "test-hash",
    firstName: "Phase",
    lastName: "Fifteen",
    phone: "555-0150",
    isActive: true,
  });
  customerId = customer.id;
  await LoyaltyAccountModel.create({ customerId: customer._id, pointsBalance: 1200, lifetimeEarnedPoints: 1200 });
  await StoreCreditAccountModel.create({ customerId: customer._id, currency: "USD", balanceMinor: 3500, lifetimeCreditedMinor: 3500 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("Phase 15 customer-value service", () => {
  it("returns customer loyalty and store-credit balances", async () => {
    const summary = await getCustomerValueSummary(customerId);
    expect(summary.loyalty.pointsBalance).toBe(1200);
    expect(summary.storeCredit.balanceMinor).toBe(3500);
  });

  it("quotes loyalty and store-credit redemption without trusting the client total", async () => {
    const quoted = await quoteValueRedemptions({
      customerId,
      currency: "USD",
      totalMinor: 5000,
      requested: {
        loyaltyPoints: 500,
        storeCreditMinor: 1000,
        giftCardMinor: 0,
      },
    });
    expect(quoted.loyaltyMinor).toBe(500);
    expect(quoted.storeCreditMinor).toBe(1000);
    expect(quoted.totalMinor).toBe(1500);
  });

  it("stores only a gift-card hash and returns the raw code only at issue time", async () => {
    const adminId = new Types.ObjectId().toString();
    const issued = await createGiftCard({
      currency: "USD",
      initialBalanceMinor: 5000,
      expiresAt: null,
      recipientEmail: "gift@example.com",
      note: "Phase 15 test",
    }, adminId);
    const card = await GiftCardModel.findById(issued.giftCard.id).select("+codeHash");
    expect(card?.codeHash).toHaveLength(64);
    expect(card?.codeHash).not.toContain(issued.code.replace(/[^a-z0-9]/gi, ""));
    const balance = await checkGiftCard(issued.code);
    expect(balance.balanceMinor).toBe(5000);
    expect(balance.codeLastFour).toHaveLength(4);
  });
});
