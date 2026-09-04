import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BulkOrderRequestModel } from "../src/modules/bulk-orders/bulk-order-request.model.js";
import { BulkOrderService } from "../src/modules/bulk-orders/bulk-order.service.js";
import { QuoteDepositPaymentModel } from "../src/modules/bulk-orders/quote-deposit.model.js";
import { QuoteModel } from "../src/modules/bulk-orders/quote.model.js";
import type {
  CreateStripePaymentIntentInput,
  StripeGateway,
  StripePaymentIntentSnapshot,
  StripeRefundSnapshot,
  StripeWebhookSnapshot,
} from "../src/modules/payments/stripe.gateway.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";
import {
  createOpaqueToken,
  sha256,
} from "../src/utils/crypto.js";

class FakeStripeGateway implements StripeGateway {
  public createCalls = 0;

  createPaymentIntent(
    input: CreateStripePaymentIntentInput,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void idempotencyKey;

    this.createCalls += 1;

    return Promise.resolve({
      id: `pi_${new Types.ObjectId().toString()}`,
      clientSecret: "pi_phase14_secret_test",
      amountMinor: input.amountMinor,
      amountReceivedMinor: 0,
      amountCapturableMinor: 0,
      currency: input.currency.toUpperCase(),
      status: "requires_payment_method",
      captureMethod: input.captureMethod,
      lastPaymentError: null,
    });
  }

  retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<StripePaymentIntentSnapshot> {
    return Promise.resolve({
      id: paymentIntentId,
      clientSecret: "pi_phase14_secret_test",
      amountMinor: 2500,
      amountReceivedMinor: 0,
      amountCapturableMinor: 0,
      currency: "USD",
      status: "requires_payment_method",
      captureMethod: "automatic",
      lastPaymentError: null,
    });
  }

  capturePaymentIntent(
    paymentIntentId: string,
    amountMinor: number | undefined,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void idempotencyKey;

    return Promise.resolve({
      id: paymentIntentId,
      clientSecret: null,
      amountMinor: amountMinor ?? 0,
      amountReceivedMinor: amountMinor ?? 0,
      amountCapturableMinor: 0,
      currency: "USD",
      status: "succeeded",
      captureMethod: "manual",
      lastPaymentError: null,
    });
  }

  cancelPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void idempotencyKey;

    return Promise.resolve({
      id: paymentIntentId,
      clientSecret: null,
      amountMinor: 0,
      amountReceivedMinor: 0,
      amountCapturableMinor: 0,
      currency: "USD",
      status: "canceled",
      captureMethod: "automatic",
      lastPaymentError: null,
    });
  }

  createRefund(
    paymentIntentId: string,
    amountMinor: number,
    idempotencyKey: string,
    metadata: Record<string, string>,
  ): Promise<StripeRefundSnapshot> {
    void paymentIntentId;
    void idempotencyKey;
    void metadata;

    return Promise.resolve({
      id: "re_phase14",
      amountMinor,
      currency: "USD",
      status: "succeeded",
      failureReason: "",
    });
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookSnapshot {
    void payload;
    void signature;

    throw new Error("Not used in this test.");
  }
}

let mongo: MongoMemoryServer;
let storeId = "";
let productId = "";
let variantId = "";

const address = {
  recipientName: "Asha Shah",
  phone: "555-0100",
  line1: "1 Grove Street",
  line2: "",
  city: "Jersey City",
  state: "NJ",
  postalCode: "07302",
  country: "USA",
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(
    mongo.getUri(),
  );

  const store = await StoreLocationModel.create({
    name: "Phase 14 Store",
    code: "P14",
    address,
    timezone: "America/New_York",
    pickupEnabled: true,
    deliveryEnabled: true,
    status: "ACTIVE",
  });

  storeId = store.id;

  const product = await ProductModel.create({
    name: "Celebration Rice",
    slug: "phase14-celebration-rice",
    shortDescription: "Rice for event catering.",
    description: "Rice for event catering.",
    categoryIds: [],
    collectionIds: [],
    productType: "PACKAGED",
    taxClassification: "GROCERY",
    variants: [
      {
        sku: "P14-RICE",
        attributes: [],
        pricing: {
          currency: "USD",
          costPriceMinor: 300,
          regularPriceMinor: 599,
          salePriceMinor: null,
        },
        sellingUnit: "BAG",
        unitQuantity: 1,
        minimumQuantity: 1,
        maximumQuantity: 100,
        quantityIncrement: 1,
        status: "ACTIVE",
      },
    ],
    isActive: true,
    archivedAt: null,
  });

  productId = product.id;

  const variant = product.variants[0];

  if (!variant) {
    throw new Error(
      "Variant missing.",
    );
  }

  variantId = variant._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("Phase 14 bulk-order service", () => {
  it("creates an inquiry and a negotiated draft quote", async () => {
    const service = new BulkOrderService(
      new FakeStripeGateway(),
    );

    const request = await service.createRequest({
      requestType: "WEDDING",

      contact: {
        firstName: "Asha",
        lastName: "Shah",
        email: "asha@example.com",
        phone: "555-0100",
      },

      eventDate: "2099-10-12T18:00:00.000Z",
      guestCount: 200,
      budgetMinor: 150000,
      currency: "USD",
      productsRequired: "Rice and event groceries",
      deliveryAddress: address,
      specialInstructions: "Deliver before 4 PM.",
    });

    const quote = await service.createQuote({
      requestId: request.id,
      storeId,
      currency: "USD",

      lines: [
        {
          lineType: "PRODUCT",
          productId,
          variantId,
          description: "Celebration Rice",
          quantity: 10,
          unitPriceMinor: 550,
        },
      ],

      discountMinor: 500,
      taxMinor: 0,
      deliveryFeeMinor: 1000,
      depositMode: "PERCENTAGE",
      depositFixedMinor: null,
      depositPercentBasisPoints: 2500,
      validUntil: "2099-10-01T00:00:00.000Z",
      customerMessage: "Thank you for considering us.",
      internalNotes: "Phase 14 test quote.",
    });

    expect(
      quote.status,
    ).toBe("DRAFT");

    expect(
      quote.pricing.subtotalMinor,
    ).toBe(5500);

    expect(
      quote.pricing.totalMinor,
    ).toBe(6000);

    expect(
      quote.deposit.amountMinor,
    ).toBe(1500);

    const storedRequest =
      await BulkOrderRequestModel.findById(
        request.id,
      ).lean();

    expect(
      storedRequest?.status,
    ).toBe("QUOTE_PREPARATION");
  });

  it("accepts a no-deposit quote without pretending a deposit was paid", async () => {
    const service = new BulkOrderService(
      new FakeStripeGateway(),
    );

    const request = await service.createRequest({
      requestType: "BULK",

      contact: {
        firstName: "Ravi",
        lastName: "Patel",
        email: "ravi@example.com",
        phone: "555-0110",
      },

      eventDate: "2099-11-01T18:00:00.000Z",
      guestCount: 50,
      budgetMinor: null,
      currency: "USD",
      productsRequired: "Bulk rice",
      deliveryAddress: address,
      specialInstructions: "",
    });

    const quote = await service.createQuote({
      requestId: request.id,
      storeId,
      currency: "USD",

      lines: [
        {
          lineType: "PRODUCT",
          productId,
          variantId,
          description: "Rice",
          quantity: 2,
          unitPriceMinor: 599,
        },
      ],

      discountMinor: 0,
      taxMinor: 0,
      deliveryFeeMinor: 0,
      depositMode: "NONE",
      depositFixedMinor: null,
      depositPercentBasisPoints: null,
      validUntil: "2099-10-20T00:00:00.000Z",
      customerMessage: "",
      internalNotes: "",
    });

    const token =
      createOpaqueToken();

    await QuoteModel.updateOne(
      {
        _id: quote.id,
      },
      {
        $set: {
          status: "SENT",
          accessTokenHash: sha256(token),
          accessTokenLastFour: token.slice(-4),
          sentAt: new Date(),
        },
      },
    );

    const accepted =
      await service.acceptQuote(
        quote.id,
        token,
      );

    expect(
      accepted.status,
    ).toBe("ACCEPTED");

    expect(
      accepted.deposit.paidMinor,
    ).toBe(0);
  });

  it("creates only one Stripe deposit intent for an idempotency key", async () => {
    const gateway =
      new FakeStripeGateway();

    const service =
      new BulkOrderService(
        gateway,
      );

    const request =
      await service.createRequest({
        requestType: "PARTY",

        contact: {
          firstName: "Mira",
          lastName: "Desai",
          email: "mira@example.com",
          phone: "555-0120",
        },

        eventDate: "2099-12-01T18:00:00.000Z",
        guestCount: 80,
        budgetMinor: 80000,
        currency: "USD",
        productsRequired: "Party groceries",
        deliveryAddress: address,
        specialInstructions: "",
      });

    const quote =
      await service.createQuote({
        requestId: request.id,
        storeId,
        currency: "USD",

        lines: [
          {
            lineType: "PRODUCT",
            productId,
            variantId,
            description: "Rice",
            quantity: 10,
            unitPriceMinor: 500,
          },
        ],

        discountMinor: 0,
        taxMinor: 0,
        deliveryFeeMinor: 0,
        depositMode: "FIXED",
        depositFixedMinor: 2500,
        depositPercentBasisPoints: null,
        validUntil: "2099-11-20T00:00:00.000Z",
        customerMessage: "",
        internalNotes: "",
      });

    const token =
      createOpaqueToken();

    await QuoteModel.updateOne(
      {
        _id: quote.id,
      },
      {
        $set: {
          status: "DEPOSIT_PENDING",
          acceptedAt: new Date(),
          accessTokenHash: sha256(token),
          accessTokenLastFour: token.slice(-4),
        },
      },
    );

    const first =
      await service.createDepositIntent(
        quote.id,
        token,
        "phase14-deposit-idempotency-key",
      );

    const second =
      await service.createDepositIntent(
        quote.id,
        token,
        "phase14-deposit-idempotency-key",
      );

    if (
      !first.payment ||
      !second.payment
    ) {
      throw new Error(
        "Expected the quote deposit payment to exist for the idempotency test.",
      );
    }

    expect(
      first.payment.amountMinor,
    ).toBe(2500);

    expect(
      second.payment.id,
    ).toBe(
      first.payment.id,
    );

    expect(
      gateway.createCalls,
    ).toBe(1);

    expect(
      await QuoteDepositPaymentModel.countDocuments({
        quoteId: quote.id,
      }),
    ).toBe(1);
  });
});