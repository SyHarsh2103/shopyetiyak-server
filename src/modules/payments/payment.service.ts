import { Types } from "mongoose";
import type { z } from "zod";

import { buildCheckoutReview } from "../checkout/checkout.service.js";
import type { CartOwner } from "../carts/cart.service.js";
import { ensureOrderForPayment, syncOrderFromPayment } from "../orders/order.service.js";
import { ApiError } from "../../utils/api-error.js";
import { sha256 } from "../../utils/crypto.js";
import { PaymentAttemptModel } from "./payment-attempt.model.js";
import { PaymentModel } from "./payment.model.js";
import { RefundModel } from "./refund.model.js";
import { StripeWebhookEventModel } from "./stripe-webhook-event.model.js";
import {
  StripeGatewayError,
  stripeGateway,
  type StripeGateway,
  type StripePaymentIntentSnapshot,
  type StripeRefundSnapshot,
  type StripeWebhookSnapshot,
} from "./stripe.gateway.js";
import type {
  createPaymentIntentSchema,
  paymentCaptureSchema,
  paymentRefundSchema,
} from "./payment.validation.js";

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type PaymentCaptureInput = z.infer<typeof paymentCaptureSchema>;
export type PaymentRefundInput = z.infer<typeof paymentRefundSchema>;

export interface AdminPaymentActor {
  adminUserId: string;
  roleNames: string[];
}

function stripeIdempotencyKey(raw: string): string {
  return `grocery-${sha256(raw)}`;
}

function paymentStatus(intent: StripePaymentIntentSnapshot) {
  switch (intent.status) {
    case "requires_action":
      return "REQUIRES_ACTION" as const;
    case "processing":
      return "PROCESSING" as const;
    case "requires_capture":
      return "AUTHORIZED" as const;
    case "canceled":
      return "CANCELLED" as const;
    case "succeeded":
      return "SUCCEEDED" as const;
    case "requires_payment_method":
      return intent.lastPaymentError ? "FAILED" as const : "PENDING" as const;
    case "requires_confirmation":
      return "PENDING" as const;
  }
}

function refundStatus(status: StripeRefundSnapshot["status"]) {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED" as const;
    case "failed":
      return "FAILED" as const;
    case "canceled":
      return "CANCELLED" as const;
    case "pending":
    case "requires_action":
    case null:
      return "PENDING" as const;
  }
}

function checkoutFingerprint(review: Awaited<ReturnType<typeof buildCheckoutReview>>): string {
  return sha256(
    JSON.stringify({
      storeId: review.fulfillment.store.id,
      identityKind: review.identity.kind,
      customerId: review.identity.customerId,
      email: review.identity.contact.email.toLowerCase(),
      fulfillmentType: review.fulfillment.type,
      address: review.fulfillment.deliveryAddress,
      deliveryZoneId: review.fulfillment.deliveryZone?.id ?? null,
      fulfillmentSlot: review.fulfillment.slot.selected,
      couponCode: review.cart.coupon.code,
      items: review.cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        lineSubtotalMinor: item.lineSubtotalMinor,
      })),
      substitutionPreferences: review.substitutionPreferences,
      totals: review.totals,
      valueRedemptions: review.valueRedemptions,
    }),
  );
}

function ownerFields(owner: CartOwner): {
  customerId: Types.ObjectId | null;
  guestTokenHash: string | null;
} {
  if (owner.customerId) {
    return {
      customerId: new Types.ObjectId(owner.customerId),
      guestTokenHash: null,
    };
  }

  if (!owner.guestToken) {
    throw new ApiError(401, "PAYMENT_OWNER_REQUIRED", "A valid checkout session is required.");
  }

  return {
    customerId: null,
    guestTokenHash: sha256(owner.guestToken),
  };
}

function ownerQuery(owner: CartOwner) {
  if (owner.customerId) {
    return { customerId: new Types.ObjectId(owner.customerId) };
  }

  if (!owner.guestToken) {
    throw new ApiError(401, "PAYMENT_OWNER_REQUIRED", "A valid checkout session is required.");
  }

  return { guestTokenHash: sha256(owner.guestToken) };
}

function serializePayment(payment: {
  _id: Types.ObjectId;
  provider: string;
  orderId?: Types.ObjectId | null;
  providerPaymentIntentId?: string | null;
  currency: string;
  amountMinor: number;
  authorizedAmountMinor: number;
  capturedAmountMinor: number;
  refundedAmountMinor: number;
  captureMethod: string;
  status: string;
  fulfillmentType: string;
  lastError?: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: payment._id.toString(),
    orderId: payment.orderId?.toString() ?? null,
    provider: payment.provider as "STRIPE" | "INTERNAL",
    providerPaymentIntentId: payment.providerPaymentIntentId ?? "",
    currency: payment.currency,
    amountMinor: payment.amountMinor,
    authorizedAmountMinor: payment.authorizedAmountMinor,
    capturedAmountMinor: payment.capturedAmountMinor,
    refundedAmountMinor: payment.refundedAmountMinor,
    captureMethod: payment.captureMethod as "AUTOMATIC" | "MANUAL",
    status: payment.status as
      | "PENDING"
      | "REQUIRES_ACTION"
      | "AUTHORIZED"
      | "PROCESSING"
      | "SUCCEEDED"
      | "FAILED"
      | "CANCELLED"
      | "PARTIALLY_REFUNDED"
      | "REFUNDED",
    fulfillmentType: payment.fulfillmentType as "DELIVERY" | "PICKUP",
    lastError: payment.lastError
      ? {
          code: payment.lastError.code,
          message: payment.lastError.message,
        }
      : null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

async function syncPaymentFromIntent(
  paymentId: Types.ObjectId,
  intent: StripePaymentIntentSnapshot,
  orderActor: "SYSTEM" | "STRIPE" | "ADMIN" = "SYSTEM",
) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found.");
  }

  const mappedStatus = paymentStatus(intent);
  const capturedAmountMinor = intent.amountReceivedMinor;
  const refundAwareStatus =
    mappedStatus === "SUCCEEDED" && payment.refundedAmountMinor > 0
      ? payment.refundedAmountMinor >= capturedAmountMinor
        ? "REFUNDED" as const
        : "PARTIALLY_REFUNDED" as const
      : mappedStatus;

  payment.providerPaymentIntentId = intent.id;
  payment.status = refundAwareStatus;
  payment.amountMinor = intent.amountMinor;
  payment.capturedAmountMinor = capturedAmountMinor;
  payment.lastError = intent.lastPaymentError;

  if (mappedStatus === "AUTHORIZED") {
    payment.authorizedAmountMinor = intent.amountCapturableMinor;
  } else if (mappedStatus === "SUCCEEDED") {
    payment.authorizedAmountMinor = Math.max(
      intent.amountReceivedMinor,
      intent.amountCapturableMinor,
    );
  }

  await payment.save();
  await syncOrderFromPayment(payment._id.toString(), orderActor);
  return payment;
}

function providerFailure(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof StripeGatewayError) {
    if (error.code === "STRIPE_NOT_CONFIGURED") {
      return new ApiError(503, error.code, error.message);
    }

    return new ApiError(502, error.code, error.message);
  }

  return new ApiError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider request failed.");
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000,
  );
}

export class PaymentService {
  constructor(private readonly gateway: StripeGateway) {}

  async createCheckoutPaymentIntent(
    owner: CartOwner,
    input: CreatePaymentIntentInput,
  ) {
    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const existingAttempt = await PaymentAttemptModel.findOne({ idempotencyKeyHash }).lean();

    if (existingAttempt && existingAttempt.operation !== "CREATE_INTENT") {
      throw new ApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for another payment operation.",
      );
    }

    let payment = existingAttempt
      ? await PaymentModel.findById(existingAttempt.paymentId)
      : null;

    if (existingAttempt && !payment) {
      throw new ApiError(
        409,
        "PAYMENT_ATTEMPT_ORPHANED",
        "The previous payment attempt is incomplete.",
      );
    }

    if (payment?.providerPaymentIntentId && payment.orderId) {
      try {
        const intent = await this.gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
        const synced = await syncPaymentFromIntent(payment._id, intent);
        if (!intent.clientSecret) {
          throw new ApiError(
            502,
            "STRIPE_CLIENT_SECRET_MISSING",
            "Stripe did not return a client secret.",
          );
        }
        return { payment: serializePayment(synced), clientSecret: intent.clientSecret };
      } catch (error: unknown) {
        if (error instanceof ApiError) {
          throw error;
        }
        throw providerFailure(error);
      }
    }

    const review = await buildCheckoutReview(owner, input);

    if (!review.payment.readyForPayment) {
      throw new ApiError(409, "CHECKOUT_NOT_READY_FOR_PAYMENT", review.payment.message);
    }

    const captureMethod = review.payment.captureMethod;
    const currentCheckoutFingerprint = checkoutFingerprint(review);

    if (
      payment &&
      !payment.providerPaymentIntentId &&
      payment.checkoutFingerprint !== currentCheckoutFingerprint
    ) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
        "The checkout changed after this payment attempt started. Start a new payment attempt.",
      );
    }

    if (!payment) {
      const fields = ownerFields(owner);
      payment = await PaymentModel.create({
        ...fields,
        cartId: review.cart.id ? new Types.ObjectId(review.cart.id) : null,
        storeId: new Types.ObjectId(review.fulfillment.store.id),
        provider: review.totals.totalMinor === 0 ? "INTERNAL" : "STRIPE",
        checkoutFingerprint: currentCheckoutFingerprint,
        currency: review.totals.currency,
        amountMinor: review.totals.totalMinor,
        authorizedAmountMinor: 0,
        capturedAmountMinor: 0,
        refundedAmountMinor: 0,
        captureMethod,
        status: "PENDING",
        customerEmail: review.identity.contact.email,
        fulfillmentType: review.fulfillment.type,
        lastError: null,
      });

      try {
        await PaymentAttemptModel.create({
          paymentId: payment._id,
          operation: "CREATE_INTENT",
          idempotencyKeyHash,
          requestedAmountMinor: review.totals.totalMinor,
          status: "STARTED",
        });
      } catch (error: unknown) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    await ensureOrderForPayment(payment._id.toString(), owner, review);
    payment = await PaymentModel.findById(payment._id);
    if (!payment) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found after order creation.");
    }

    if (payment.amountMinor === 0) {
      payment.provider = "INTERNAL";
      payment.status = "SUCCEEDED";
      payment.authorizedAmountMinor = 0;
      payment.capturedAmountMinor = 0;
      payment.lastError = null;
      await payment.save();
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        { $set: { status: "SUCCEEDED", providerObjectId: "INTERNAL" } },
      );
      await syncOrderFromPayment(payment._id.toString(), "SYSTEM");
      return { payment: serializePayment(payment), clientSecret: "" };
    }

    if (payment.providerPaymentIntentId) {
      try {
        const intent = await this.gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
        const synced = await syncPaymentFromIntent(payment._id, intent);
        if (!intent.clientSecret) {
          throw new ApiError(
            502,
            "STRIPE_CLIENT_SECRET_MISSING",
            "Stripe did not return a client secret.",
          );
        }
        return { payment: serializePayment(synced), clientSecret: intent.clientSecret };
      } catch (error: unknown) {
        if (error instanceof ApiError) {
          throw error;
        }
        throw providerFailure(error);
      }
    }

    try {
      const intent = await this.gateway.createPaymentIntent(
        {
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          captureMethod: payment.captureMethod === "MANUAL" ? "manual" : "automatic",
          customerEmail: payment.customerEmail,
          metadata: {
            grocery_payment_id: payment._id.toString(),
            grocery_order_id: payment.orderId?.toString() ?? "",
            grocery_store_id: payment.storeId.toString(),
            checkout_fingerprint: payment.checkoutFingerprint,
            capture_method: payment.captureMethod,
          },
        },
        stripeIdempotencyKey(input.idempotencyKey),
      );

      const synced = await syncPaymentFromIntent(payment._id, intent);
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        {
          $set: {
            status: "SUCCEEDED",
            providerObjectId: intent.id,
            errorCode: "",
            errorMessage: "",
          },
        },
      );

      if (!intent.clientSecret) {
        throw new ApiError(
          502,
          "STRIPE_CLIENT_SECRET_MISSING",
          "Stripe did not return a client secret.",
        );
      }

      return { payment: serializePayment(synced), clientSecret: intent.clientSecret };
    } catch (error: unknown) {
      const providerError = providerFailure(error);
      await Promise.all([
        PaymentAttemptModel.updateOne(
          { idempotencyKeyHash },
          {
            $set: {
              status: "FAILED",
              errorCode: providerError.code,
              errorMessage: providerError.message,
            },
          },
        ),
        PaymentModel.updateOne(
          { _id: payment._id },
          {
            $set: {
              status: "FAILED",
              lastError: {
                code: providerError.code,
                message: providerError.message,
              },
            },
          },
        ),
      ]);
      await syncOrderFromPayment(payment._id.toString());
      throw providerError;
    }
  }

  async getPaymentForOwner(owner: CartOwner, paymentId: string) {
    const payment = await PaymentModel.findOne({
      _id: new Types.ObjectId(paymentId),
      ...ownerQuery(owner),
    });

    if (!payment) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found.");
    }

    if (payment.providerPaymentIntentId) {
      try {
        const intent = await this.gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
        const synced = await syncPaymentFromIntent(payment._id, intent);
        return serializePayment(synced);
      } catch (error: unknown) {
        if (error instanceof StripeGatewayError && error.code === "STRIPE_NOT_CONFIGURED") {
          return serializePayment(payment);
        }
        throw providerFailure(error);
      }
    }

    return serializePayment(payment);
  }

  async capturePayment(paymentId: string, input: PaymentCaptureInput) {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found.");
    }
    if (payment.captureMethod !== "MANUAL") {
      throw new ApiError(409, "PAYMENT_NOT_MANUAL_CAPTURE", "This payment does not use manual capture.");
    }
    if (!payment.providerPaymentIntentId) {
      throw new ApiError(409, "PAYMENT_PROVIDER_REFERENCE_MISSING", "Stripe PaymentIntent is not linked.");
    }

    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const existing = await PaymentAttemptModel.findOne({ idempotencyKeyHash });

    if (existing) {
      if (existing.paymentId.toString() !== payment.id || existing.operation !== "CAPTURE") {
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key is already in use.");
      }

      if (
        input.amountMinor !== undefined &&
        existing.requestedAmountMinor !== input.amountMinor
      ) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_PAYLOAD_MISMATCH",
          "The capture retry must use the original amount.",
        );
      }

      if (existing.status === "SUCCEEDED") {
        try {
          const intent = await this.gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
          return serializePayment(await syncPaymentFromIntent(payment._id, intent));
        } catch (error: unknown) {
          throw providerFailure(error);
        }
      }
    }

    if (payment.status !== "AUTHORIZED") {
      throw new ApiError(409, "PAYMENT_NOT_AUTHORIZED", "Only an authorized payment can be captured.");
    }

    const amountMinor =
      existing?.requestedAmountMinor ??
      input.amountMinor ??
      payment.authorizedAmountMinor;

    if (amountMinor <= 0 || amountMinor > payment.authorizedAmountMinor) {
      throw new ApiError(
        400,
        "INVALID_CAPTURE_AMOUNT",
        "Capture amount must be positive and cannot exceed the authorized amount.",
      );
    }

    if (existing) {
      existing.status = "STARTED";
      existing.errorCode = "";
      existing.errorMessage = "";
      await existing.save();
    } else {
      await PaymentAttemptModel.create({
        paymentId: payment._id,
        operation: "CAPTURE",
        idempotencyKeyHash,
        requestedAmountMinor: amountMinor,
        status: "STARTED",
      });
    }

    try {
      const intent = await this.gateway.capturePaymentIntent(
        payment.providerPaymentIntentId,
        amountMinor,
        stripeIdempotencyKey(input.idempotencyKey),
      );
      const synced = await syncPaymentFromIntent(payment._id, intent);
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        { $set: { status: "SUCCEEDED", providerObjectId: intent.id } },
      );
      return serializePayment(synced);
    } catch (error: unknown) {
      const providerError = providerFailure(error);
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        {
          $set: {
            status: "FAILED",
            errorCode: providerError.code,
            errorMessage: providerError.message,
          },
        },
      );
      throw providerError;
    }
  }

  async cancelPayment(paymentId: string, idempotencyKey: string) {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found.");
    }
    if (!payment.providerPaymentIntentId) {
      throw new ApiError(409, "PAYMENT_PROVIDER_REFERENCE_MISSING", "Stripe PaymentIntent is not linked.");
    }
    if (["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw new ApiError(409, "PAYMENT_CANNOT_BE_CANCELLED", "Captured payments must be refunded instead.");
    }

    const idempotencyKeyHash = sha256(idempotencyKey);
    const existing = await PaymentAttemptModel.findOne({ idempotencyKeyHash });
    if (existing) {
      if (existing.paymentId.toString() !== payment.id || existing.operation !== "CANCEL") {
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key is already in use.");
      }
      if (existing.status === "SUCCEEDED" && payment.providerPaymentIntentId) {
        try {
          const intent = await this.gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
          return serializePayment(await syncPaymentFromIntent(payment._id, intent));
        } catch (error: unknown) {
          throw providerFailure(error);
        }
      }
      existing.status = "STARTED";
      existing.errorCode = "";
      existing.errorMessage = "";
      await existing.save();
    } else {
      await PaymentAttemptModel.create({
        paymentId: payment._id,
        operation: "CANCEL",
        idempotencyKeyHash,
        status: "STARTED",
      });
    }

    try {
      const intent = await this.gateway.cancelPaymentIntent(
        payment.providerPaymentIntentId,
        stripeIdempotencyKey(idempotencyKey),
      );
      const synced = await syncPaymentFromIntent(payment._id, intent);
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        { $set: { status: "SUCCEEDED", providerObjectId: intent.id } },
      );
      return serializePayment(synced);
    } catch (error: unknown) {
      const providerError = providerFailure(error);
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash },
        {
          $set: {
            status: "FAILED",
            errorCode: providerError.code,
            errorMessage: providerError.message,
          },
        },
      );
      throw providerError;
    }
  }

  async refundPayment(
    paymentId: string,
    input: PaymentRefundInput,
    actor: AdminPaymentActor,
  ) {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment record was not found.");
    }
    if (!payment.providerPaymentIntentId) {
      throw new ApiError(409, "PAYMENT_PROVIDER_REFERENCE_MISSING", "Stripe PaymentIntent is not linked.");
    }

    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const existingRefund = await RefundModel.findOne({ idempotencyKeyHash });

    if (existingRefund) {
      if (existingRefund.paymentId.toString() !== payment.id) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key is already in use.");
      }
      if (input.amountMinor !== undefined && existingRefund.amountMinor !== input.amountMinor) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_PAYLOAD_MISMATCH",
          "The refund retry must use the original amount.",
        );
      }
      if (existingRefund.providerRefundId) {
        await syncOrderFromPayment(payment._id.toString(), "ADMIN");
        return {
          refund: {
            id: existingRefund.id,
            providerRefundId: existingRefund.providerRefundId,
            amountMinor: existingRefund.amountMinor,
            currency: existingRefund.currency,
            status: existingRefund.status,
            reason: existingRefund.reason,
          },
          payment: serializePayment(payment),
        };
      }
    }

    if (!existingRefund && !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw new ApiError(409, "PAYMENT_NOT_REFUNDABLE", "Only captured payments can be refunded.");
    }

    const refundableMinor = Math.max(0, payment.capturedAmountMinor - payment.refundedAmountMinor);
    const amountMinor = existingRefund?.amountMinor ?? input.amountMinor ?? refundableMinor;

    if (!existingRefund && (amountMinor <= 0 || amountMinor > refundableMinor)) {
      throw new ApiError(
        400,
        "INVALID_REFUND_AMOUNT",
        "Refund amount must be positive and cannot exceed the remaining captured amount.",
      );
    }

    const refund = existingRefund ?? await RefundModel.create({
      paymentId: payment._id,
      orderId: payment.orderId,
      requestedByAdminId: new Types.ObjectId(actor.adminUserId),
      idempotencyKeyHash,
      currency: payment.currency,
      amountMinor,
      reason: input.reason,
      status: "PENDING",
    });

    const refundAttemptHash = sha256(`refund-attempt:${input.idempotencyKey}`);
    const refundAttempt = await PaymentAttemptModel.findOne({ idempotencyKeyHash: refundAttemptHash });
    if (refundAttempt) {
      if (
        refundAttempt.paymentId.toString() !== payment.id ||
        refundAttempt.operation !== "REFUND" ||
        refundAttempt.requestedAmountMinor !== amountMinor
      ) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This refund attempt key is inconsistent.");
      }
      refundAttempt.status = "STARTED";
      refundAttempt.errorCode = "";
      refundAttempt.errorMessage = "";
      await refundAttempt.save();
    } else {
      await PaymentAttemptModel.create({
        paymentId: payment._id,
        operation: "REFUND",
        idempotencyKeyHash: refundAttemptHash,
        requestedAmountMinor: amountMinor,
        status: "STARTED",
      });
    }

    try {
      const providerRefund = await this.gateway.createRefund(
        payment.providerPaymentIntentId,
        amountMinor,
        stripeIdempotencyKey(input.idempotencyKey),
        {
          grocery_payment_id: payment.id,
          grocery_refund_id: refund.id,
        },
      );
      const mappedRefundStatus = refundStatus(providerRefund.status);
      refund.providerRefundId = providerRefund.id;
      refund.status = mappedRefundStatus;
      refund.failureReason = providerRefund.failureReason;
      await refund.save();

      if (mappedRefundStatus === "SUCCEEDED") {
        payment.refundedAmountMinor += amountMinor;
        payment.status = payment.refundedAmountMinor >= payment.capturedAmountMinor
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED";
        await payment.save();
        await syncOrderFromPayment(payment._id.toString(), "ADMIN");
      }

      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash: refundAttemptHash },
        {
          $set: {
            status: mappedRefundStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
            providerObjectId: providerRefund.id,
            errorCode: mappedRefundStatus === "FAILED" ? "STRIPE_REFUND_FAILED" : "",
            errorMessage: providerRefund.failureReason,
          },
        },
      );

      return {
        refund: {
          id: refund.id,
          providerRefundId: refund.providerRefundId ?? "",
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason,
        },
        payment: serializePayment(payment),
      };
    } catch (error: unknown) {
      const providerError = providerFailure(error);
      refund.status = "FAILED";
      refund.failureReason = providerError.message;
      await refund.save();
      await PaymentAttemptModel.updateOne(
        { idempotencyKeyHash: refundAttemptHash },
        {
          $set: {
            status: "FAILED",
            errorCode: providerError.code,
            errorMessage: providerError.message,
          },
        },
      );
      throw providerError;
    }
  }

  async processStripeWebhook(event: StripeWebhookSnapshot) {
    let duplicate = false;

    try {
      await StripeWebhookEventModel.create({
        providerEventId: event.id,
        type: event.type,
        apiVersion: event.apiVersion,
        livemode: event.livemode,
        providerCreatedAt: event.createdAt,
        paymentIntentId: event.paymentIntent?.id ?? "",
        processingStatus: "RECEIVED",
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      duplicate = true;
      const existingEvent = await StripeWebhookEventModel.findOne({ providerEventId: event.id });
      if (!existingEvent) {
        throw error;
      }

      if (["PROCESSED", "IGNORED"].includes(existingEvent.processingStatus)) {
        return { duplicate: true, processed: false };
      }

      existingEvent.processingStatus = "RECEIVED";
      existingEvent.errorMessage = "";
      existingEvent.processedAt = null;
      await existingEvent.save();
    }

    if (!event.paymentIntent) {
      await StripeWebhookEventModel.updateOne(
        { providerEventId: event.id },
        {
          $set: {
            processingStatus: "IGNORED",
            processedAt: new Date(),
          },
        },
      );
      return { duplicate, processed: false };
    }

    const payment = await PaymentModel.findOne({
      providerPaymentIntentId: event.paymentIntent.id,
    });

    if (!payment) {
      await StripeWebhookEventModel.updateOne(
        { providerEventId: event.id },
        {
          $set: {
            processingStatus: "IGNORED",
            processedAt: new Date(),
          },
        },
      );
      return { duplicate, processed: false };
    }

    try {
      await syncPaymentFromIntent(payment._id, event.paymentIntent, "STRIPE");
      await StripeWebhookEventModel.updateOne(
        { providerEventId: event.id },
        {
          $set: {
            processingStatus: "PROCESSED",
            errorMessage: "",
            processedAt: new Date(),
          },
        },
      );
      return { duplicate, processed: true };
    } catch (error: unknown) {
      await StripeWebhookEventModel.updateOne(
        { providerEventId: event.id },
        {
          $set: {
            processingStatus: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Webhook processing failed.",
            processedAt: new Date(),
          },
        },
      );
      throw error;
    }
  }

}

export const paymentService = new PaymentService(stripeGateway);
