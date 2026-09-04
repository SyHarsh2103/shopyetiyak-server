import { describe, expect, it } from "vitest";

import {
  createPaymentIntentSchema,
  paymentCaptureSchema,
  paymentRefundSchema,
} from "../src/modules/payments/payment.validation.js";

describe("payment validation", () => {
  it("requires a durable idempotency key for PaymentIntent creation", () => {
    expect(
      createPaymentIntentSchema.safeParse({
        storeId: "64b000000000000000000001",
        fulfillmentType: "PICKUP",
        guest: {
          firstName: "Asha",
          lastName: "Shah",
          email: "asha@example.com",
          phone: "555-0100",
        },
        idempotencyKey: "phase8-create-1234567890",
      }).success,
    ).toBe(true);

    expect(
      createPaymentIntentSchema.safeParse({
        storeId: "64b000000000000000000001",
        fulfillmentType: "PICKUP",
        guest: {
          firstName: "Asha",
          lastName: "Shah",
          email: "asha@example.com",
          phone: "555-0100",
        },
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });

  it("validates capture and refund amounts as positive minor units", () => {
    expect(
      paymentCaptureSchema.parse({
        idempotencyKey: "phase8-capture-1234567890",
        amountMinor: 500,
      }).amountMinor,
    ).toBe(500);

    expect(() =>
      paymentRefundSchema.parse({
        idempotencyKey: "phase8-refund-1234567890",
        amountMinor: 0,
      }),
    ).toThrow();
  });
});
