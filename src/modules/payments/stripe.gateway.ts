import Stripe from "stripe";

import { env } from "../../config/env.js";

export interface StripePaymentIntentSnapshot {
  id: string;
  clientSecret: string | null;
  amountMinor: number;
  amountReceivedMinor: number;
  amountCapturableMinor: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  captureMethod:
    | "automatic"
    | "automatic_async"
    | "manual";
  lastPaymentError: {
    code: string;
    message: string;
  } | null;
}

export interface StripeRefundSnapshot {
  id: string;
  amountMinor: number;
  currency: string;
  status:
    | "pending"
    | "requires_action"
    | "succeeded"
    | "failed"
    | "canceled"
    | null;
  failureReason: string;
}

export interface StripeWebhookSnapshot {
  id: string;
  type: string;
  apiVersion: string;
  livemode: boolean;
  createdAt: Date;
  paymentIntent:
    | StripePaymentIntentSnapshot
    | null;
}

export interface CreateStripePaymentIntentInput {
  amountMinor: number;
  currency: string;
  captureMethod:
    | "automatic"
    | "manual";
  customerEmail: string;
  metadata: Record<string, string>;
}

export interface StripeGateway {
  createPaymentIntent(
    input: CreateStripePaymentIntentInput,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot>;

  retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<StripePaymentIntentSnapshot>;

  capturePaymentIntent(
    paymentIntentId: string,
    amountMinor: number | undefined,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot>;

  cancelPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot>;

  createRefund(
    paymentIntentId: string,
    amountMinor: number,
    idempotencyKey: string,
    metadata: Record<string, string>,
  ): Promise<StripeRefundSnapshot>;

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookSnapshot;
}

export class StripeGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StripeGatewayError";
  }
}

function stripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeGatewayError(
      "STRIPE_NOT_CONFIGURED",
      "Stripe test credentials are not configured on the server.",
    );
  }

  if (
    env.NODE_ENV !== "production" &&
    !env.STRIPE_SECRET_KEY.startsWith(
      "sk_test_",
    )
  ) {
    throw new StripeGatewayError(
      "STRIPE_TEST_KEY_REQUIRED",
      "Development and test environments require a Stripe test-mode secret key.",
    );
  }

  return new Stripe(
    env.STRIPE_SECRET_KEY,
  );
}

function safeStripeError(
  error: unknown,
): StripeGatewayError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return new StripeGatewayError(
      error.code,
      "Stripe could not process the request.",
    );
  }

  return new StripeGatewayError(
    "STRIPE_REQUEST_FAILED",
    "Stripe could not process the request.",
  );
}

function normalizeCaptureMethod(
  captureMethod:
    Stripe.PaymentIntent["capture_method"],
): StripePaymentIntentSnapshot["captureMethod"] {
  switch (captureMethod) {
    case "automatic":
      return "automatic";

    case "automatic_async":
      return "automatic_async";

    case "manual":
      return "manual";

    default:
      throw new StripeGatewayError(
        "STRIPE_CAPTURE_METHOD_UNSUPPORTED",
        "Stripe returned an unsupported payment capture method.",
      );
  }
}

function normalizeRefundStatus(
  status: Stripe.Refund["status"],
): StripeRefundSnapshot["status"] {
  switch (status) {
    case "pending":
    case "requires_action":
    case "succeeded":
    case "failed":
    case "canceled":
    case null:
      return status;

    default:
      throw new StripeGatewayError(
        "STRIPE_REFUND_STATUS_UNSUPPORTED",
        "Stripe returned an unsupported refund status.",
      );
  }
}

function paymentIntentSnapshot(
  intent: Stripe.PaymentIntent,
): StripePaymentIntentSnapshot {
  return {
    id:
      intent.id,

    clientSecret:
      intent.client_secret,

    amountMinor:
      intent.amount,

    amountReceivedMinor:
      intent.amount_received,

    amountCapturableMinor:
      intent.amount_capturable,

    currency:
      intent.currency.toUpperCase(),

    status:
      intent.status,

    captureMethod:
      normalizeCaptureMethod(
        intent.capture_method,
      ),

    lastPaymentError:
      intent.last_payment_error
        ? {
            code:
              intent.last_payment_error
                .code ??
              intent.last_payment_error
                .type,

            message:
              intent.last_payment_error
                .message ??
              "Payment failed.",
          }
        : null,
  };
}

function refundSnapshot(
  refund: Stripe.Refund,
): StripeRefundSnapshot {
  return {
    id:
      refund.id,

    amountMinor:
      refund.amount,

    currency:
      refund.currency.toUpperCase(),

    status:
      normalizeRefundStatus(
        refund.status,
      ),

    failureReason:
      refund.failure_reason ?? "",
  };
}

export class StripeSdkGateway
  implements StripeGateway
{
  async createPaymentIntent(
    input: CreateStripePaymentIntentInput,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    try {
      const intent =
        await stripeClient().paymentIntents.create(
          {
            amount:
              input.amountMinor,

            currency:
              input.currency.toLowerCase(),

            capture_method:
              input.captureMethod,

            automatic_payment_methods: {
              enabled: true,
            },

            receipt_email:
              input.customerEmail,

            metadata:
              input.metadata,
          },
          {
            idempotencyKey,
          },
        );

      return paymentIntentSnapshot(
        intent,
      );
    } catch (error: unknown) {
      throw safeStripeError(
        error,
      );
    }
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<StripePaymentIntentSnapshot> {
    try {
      const intent =
        await stripeClient().paymentIntents.retrieve(
          paymentIntentId,
        );

      return paymentIntentSnapshot(
        intent,
      );
    } catch (error: unknown) {
      throw safeStripeError(
        error,
      );
    }
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    amountMinor: number | undefined,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    try {
      const intent =
        await stripeClient().paymentIntents.capture(
          paymentIntentId,
          amountMinor === undefined
            ? {}
            : {
                amount_to_capture:
                  amountMinor,
              },
          {
            idempotencyKey,
          },
        );

      return paymentIntentSnapshot(
        intent,
      );
    } catch (error: unknown) {
      throw safeStripeError(
        error,
      );
    }
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentSnapshot> {
    try {
      const intent =
        await stripeClient().paymentIntents.cancel(
          paymentIntentId,
          {},
          {
            idempotencyKey,
          },
        );

      return paymentIntentSnapshot(
        intent,
      );
    } catch (error: unknown) {
      throw safeStripeError(
        error,
      );
    }
  }

  async createRefund(
    paymentIntentId: string,
    amountMinor: number,
    idempotencyKey: string,
    metadata: Record<string, string>,
  ): Promise<StripeRefundSnapshot> {
    try {
      const refund =
        await stripeClient().refunds.create(
          {
            payment_intent:
              paymentIntentId,

            amount:
              amountMinor,

            metadata,
          },
          {
            idempotencyKey,
          },
        );

      return refundSnapshot(
        refund,
      );
    } catch (error: unknown) {
      throw safeStripeError(
        error,
      );
    }
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookSnapshot {
    if (
      !env.STRIPE_WEBHOOK_SECRET
    ) {
      throw new StripeGatewayError(
        "STRIPE_WEBHOOK_NOT_CONFIGURED",
        "Stripe webhook verification is not configured on the server.",
      );
    }

    let event: Stripe.Event;

    try {
      event =
        stripeClient().webhooks.constructEvent(
          payload,
          signature,
          env.STRIPE_WEBHOOK_SECRET,
        );
    } catch {
      throw new StripeGatewayError(
        "STRIPE_WEBHOOK_SIGNATURE_INVALID",
        "Stripe webhook signature verification failed.",
      );
    }

    const keyMode =
      env.STRIPE_SECRET_KEY?.includes(
        "_live_",
      )
        ? "live"
        : env.STRIPE_SECRET_KEY?.includes(
              "_test_",
            )
          ? "test"
          : null;

    if (
      keyMode &&
      event.livemode !==
        (keyMode === "live")
    ) {
      throw new StripeGatewayError(
        "STRIPE_WEBHOOK_MODE_MISMATCH",
        "Stripe webhook mode does not match the configured server credentials.",
      );
    }

    const eventObject =
      event.data.object;

    const intent =
      eventObject.object ===
      "payment_intent"
        ? eventObject
        : null;

    return {
      id:
        event.id,

      type:
        event.type,

      apiVersion:
        event.api_version ?? "",

      livemode:
        event.livemode,

      createdAt:
        new Date(
          event.created * 1000,
        ),

      paymentIntent:
        intent
          ? paymentIntentSnapshot(
              intent,
            )
          : null,
    };
  }
}

export const stripeGateway:
  StripeGateway =
  new StripeSdkGateway();