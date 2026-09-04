import mongoose, {
  Types,
} from "mongoose";
import {
  MongoMemoryReplSet,
} from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  addCartItem,
} from "../src/modules/carts/cart.service.js";
import {
  InventoryModel,
} from "../src/modules/inventory/inventory.model.js";
import {
  PaymentAttemptModel,
} from "../src/modules/payments/payment-attempt.model.js";
import {
  PaymentModel,
} from "../src/modules/payments/payment.model.js";
import {
  PaymentService,
} from "../src/modules/payments/payment.service.js";
import {
  RefundModel,
} from "../src/modules/payments/refund.model.js";
import {
  StripeWebhookEventModel,
} from "../src/modules/payments/stripe-webhook-event.model.js";
import type {
  CreateStripePaymentIntentInput,
  StripeGateway,
  StripePaymentIntentSnapshot,
  StripeRefundSnapshot,
  StripeWebhookSnapshot,
} from "../src/modules/payments/stripe.gateway.js";
import {
  PickupSlotModel,
} from "../src/modules/pickup/pickup-slot.model.js";
import {
  ProductModel,
} from "../src/modules/products/product.model.js";
import {
  StoreLocationModel,
} from "../src/modules/stores/store-location.model.js";
import {
  TaxRuleModel,
} from "../src/modules/taxes/tax-rule.model.js";

class FakeStripeGateway
  implements StripeGateway
{
  public createInput:
    CreateStripePaymentIntentInput | null =
    null;

  public createCalls = 0;

  private readonly intentId =
    `pi_${new Types.ObjectId().toString()}`;

  private intent:
    StripePaymentIntentSnapshot | null =
    null;

  createPaymentIntent(
    input: CreateStripePaymentIntentInput,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void idempotencyKey;

    this.createCalls += 1;
    this.createInput = input;

    this.intent = {
      id: this.intentId,
      clientSecret:
        `${this.intentId}_secret_test`,
      amountMinor:
        input.amountMinor,
      amountReceivedMinor:
        0,
      amountCapturableMinor:
        0,
      currency:
        input.currency.toUpperCase(),
      status:
        "requires_payment_method",
      captureMethod:
        input.captureMethod,
      lastPaymentError:
        null,
    };

    return Promise.resolve(
      this.intent,
    );
  }

  retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void paymentIntentId;

    if (!this.intent) {
      return Promise.reject(
        new Error(
          "Fake PaymentIntent is missing.",
        ),
      );
    }

    return Promise.resolve(
      this.intent,
    );
  }

  capturePaymentIntent(
    paymentIntentId: string,
    amountMinor: number | undefined,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void paymentIntentId;
    void idempotencyKey;

    if (!this.intent) {
      return Promise.reject(
        new Error(
          "Fake PaymentIntent is missing.",
        ),
      );
    }

    const captured =
      amountMinor ??
      this.intent.amountMinor;

    this.intent = {
      ...this.intent,
      amountReceivedMinor:
        captured,
      amountCapturableMinor:
        0,
      status:
        "succeeded",
    };

    return Promise.resolve(
      this.intent,
    );
  }

  cancelPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    void paymentIntentId;
    void idempotencyKey;

    if (!this.intent) {
      return Promise.reject(
        new Error(
          "Fake PaymentIntent is missing.",
        ),
      );
    }

    this.intent = {
      ...this.intent,
      amountCapturableMinor:
        0,
      status:
        "canceled",
    };

    return Promise.resolve(
      this.intent,
    );
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
      id:
        "re_phase8_test",
      amountMinor,
      currency:
        "USD",
      status:
        "succeeded",
      failureReason:
        "",
    });
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookSnapshot {
    void payload;
    void signature;

    throw new Error(
      "Not used in this unit test.",
    );
  }
}

let replicaSet: MongoMemoryReplSet;
let storeId = "";
let productId = "";
let variantId = "";
let pickupSlotId = "";

const owner = {
  guestToken:
    "phase-eight-guest-token",
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

  const store =
    await StoreLocationModel.create({
      name:
        "Phase 8 Store",
      code:
        "P8",
      address: {
        line1:
          "8 Stripe Street",
        line2:
          "",
        city:
          "Jersey City",
        state:
          "NJ",
        postalCode:
          "07302",
        country:
          "USA",
      },
      timezone:
        "America/New_York",
      pickupEnabled:
        true,
      deliveryEnabled:
        true,
      status:
        "ACTIVE",
    });

  storeId = store.id;

  const pickupSlot = await PickupSlotModel.create({
    storeId: store._id,
    date: "2099-01-02",
    startTime: "09:00",
    endTime: "11:00",
    timezone: store.timezone,
    capacity: 20,
    bookedCount: 0,
    cutoffMinutes: 60,
    cutoffAt: new Date("2099-01-02T14:00:00.000Z"),
    status: "ACTIVE",
  });
  pickupSlotId = pickupSlot.id;

  const product =
    await ProductModel.create({
      name:
        "Variable Weight Tomatoes",
      slug:
        "phase8-variable-weight-tomatoes",
      shortDescription:
        "Fresh tomatoes",
      description:
        "Fresh tomatoes for Stripe authorization testing.",
      categoryIds:
        [],
      collectionIds:
        [],
      productType:
        "VARIABLE_WEIGHT",
      taxClassification:
        "GROCERY",
      variants: [
        {
          sku:
            "P8-TOMATO-LB",
          attributes:
            [],
          pricing: {
            currency:
              "USD",
            costPriceMinor:
              150,
            regularPriceMinor:
              400,
            salePriceMinor:
              null,
          },
          sellingUnit:
            "POUND",
          unitQuantity:
            1,
          minimumQuantity:
            1,
          maximumQuantity:
            5,
          quantityIncrement:
            0.25,
          status:
            "ACTIVE",
        },
      ],
      isActive:
        true,
      archivedAt:
        null,
    });

  productId =
    product.id;

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
    storeId:
      store._id,
    productId:
      product._id,
    variantId:
      variant._id,
    quantityOnHand:
      20,
    quantityReserved:
      0,
    quantityAvailable:
      20,
    reorderLevel:
      2,
    reorderQuantity:
      10,
  });

  await TaxRuleModel.create({
    name:
      "Phase 8 NJ Tax",
    country:
      "USA",
    state:
      "NJ",
    taxClassification:
      "GROCERY",
    rateBasisPoints:
      700,
    isActive:
      true,
  });

  await addCartItem(
    owner,
    {
      storeId,
      productId,
      variantId,
      quantity:
        1,
    },
  );
});

afterAll(async () => {
  await mongoose.disconnect();

  await replicaSet.stop();
});

describe(
  "Phase 8 payment service",
  () => {
    it(
      "creates one idempotent manual-capture PaymentIntent for a variable-weight checkout",
      async () => {
        const gateway =
          new FakeStripeGateway();

        const service =
          new PaymentService(
            gateway,
          );

        const input = {
          storeId,
          fulfillmentType:
            "PICKUP" as const,
          pickupSlotId,
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
          customerNotes:
            "",
          idempotencyKey:
            "phase8-create-payment-1234567890",
        };

        const first =
          await service.createCheckoutPaymentIntent(
            owner,
            input,
          );

        const second =
          await service.createCheckoutPaymentIntent(
            owner,
            input,
          );

        expect(
          first.payment
            .captureMethod,
        ).toBe(
          "MANUAL",
        );

        expect(
          first.clientSecret,
        ).toContain(
          "_secret_test",
        );

        expect(
          second.payment.id,
        ).toBe(
          first.payment.id,
        );

        expect(
          gateway.createInput
            ?.captureMethod,
        ).toBe(
          "manual",
        );

        expect(
          gateway.createCalls,
        ).toBe(
          1,
        );

        expect(
          await PaymentModel.countDocuments(),
        ).toBe(
          1,
        );

        expect(
          await PaymentAttemptModel.countDocuments(),
        ).toBe(
          1,
        );
      },
    );

    it(
      "deduplicates Stripe webhooks, authorizes, captures and refunds the payment",
      async () => {
        const gateway =
          new FakeStripeGateway();

        const service =
          new PaymentService(
            gateway,
          );

        const created =
          await service.createCheckoutPaymentIntent(
            owner,
            {
              storeId,
              fulfillmentType:
                "PICKUP",
              pickupSlotId,
              guest: {
                firstName:
                  "Mira",
                lastName:
                  "Patel",
                email:
                  "mira@example.com",
                phone:
                  "555-0110",
              },
              customerNotes:
                "",
              idempotencyKey:
                "phase8-second-payment-1234567890",
            },
          );

        const authorizedIntent:
          StripePaymentIntentSnapshot =
          {
            id:
              created.payment
                .providerPaymentIntentId,
            clientSecret:
              `${created.payment.providerPaymentIntentId}_secret_test`,
            amountMinor:
              created.payment
                .amountMinor,
            amountReceivedMinor:
              0,
            amountCapturableMinor:
              created.payment
                .amountMinor,
            currency:
              "USD",
            status:
              "requires_capture",
            captureMethod:
              "manual",
            lastPaymentError:
              null,
          };

        const webhook:
          StripeWebhookSnapshot =
          {
            id:
              "evt_phase8_authorized",
            type:
              "payment_intent.amount_capturable_updated",
            apiVersion:
              "test",
            livemode:
              false,
            createdAt:
              new Date(),
            paymentIntent:
              authorizedIntent,
          };

        expect(
          await service.processStripeWebhook(
            webhook,
          ),
        ).toEqual({
          duplicate:
            false,
          processed:
            true,
        });

        expect(
          await service.processStripeWebhook(
            webhook,
          ),
        ).toEqual({
          duplicate:
            true,
          processed:
            false,
        });

        const authorized =
          await PaymentModel.findById(
            created.payment.id,
          ).lean();

        expect(
          authorized?.status,
        ).toBe(
          "AUTHORIZED",
        );

        expect(
          authorized
            ?.authorizedAmountMinor,
        ).toBe(
          created.payment
            .amountMinor,
        );

        expect(
          await StripeWebhookEventModel.countDocuments(),
        ).toBe(
          1,
        );

        const captureInput = {
          idempotencyKey:
            "phase8-capture-payment-1234567890",
          amountMinor:
            created.payment
              .amountMinor,
        };

        const captured =
          await service.capturePayment(
            created.payment.id,
            captureInput,
          );

        const capturedRetry =
          await service.capturePayment(
            created.payment.id,
            captureInput,
          );

        expect(
          captured.status,
        ).toBe(
          "SUCCEEDED",
        );

        expect(
          captured
            .capturedAmountMinor,
        ).toBe(
          created.payment
            .amountMinor,
        );

        expect(
          capturedRetry.status,
        ).toBe(
          "SUCCEEDED",
        );

        const refundInput = {
          idempotencyKey:
            "phase8-refund-payment-1234567890",
          amountMinor:
            created.payment
              .amountMinor,
          reason:
            "Phase 8 test refund",
        };

        const refunded =
          await service.refundPayment(
            created.payment.id,
            refundInput,
            {
              adminUserId:
                new Types.ObjectId().toString(),
              roleNames: [
                "SUPER_ADMIN",
              ],
            },
          );

        const refundedRetry =
          await service.refundPayment(
            created.payment.id,
            refundInput,
            {
              adminUserId:
                new Types.ObjectId().toString(),
              roleNames: [
                "SUPER_ADMIN",
              ],
            },
          );

        expect(
          refunded.payment
            .status,
        ).toBe(
          "REFUNDED",
        );

        expect(
          refunded.refund
            .status,
        ).toBe(
          "SUCCEEDED",
        );

        expect(
          refundedRetry.payment
            .status,
        ).toBe(
          "REFUNDED",
        );

        expect(
          refundedRetry.refund
            .id,
        ).toBe(
          refunded.refund.id,
        );

        expect(
          await RefundModel.countDocuments(),
        ).toBe(
          1,
        );

        await StripeWebhookEventModel.updateOne(
          {
            providerEventId:
              webhook.id,
          },
          {
            $set: {
              processingStatus:
                "FAILED",
              errorMessage:
                "Simulated transient processing failure",
            },
          },
        );

        expect(
          await service.processStripeWebhook(
            webhook,
          ),
        ).toEqual({
          duplicate:
            true,
          processed:
            true,
        });

        const retriedEvent =
          await StripeWebhookEventModel.findOne(
            {
              providerEventId:
                webhook.id,
            },
          ).lean();

        expect(
          retriedEvent
            ?.processingStatus,
        ).toBe(
          "PROCESSED",
        );
      },
    );
  },
);