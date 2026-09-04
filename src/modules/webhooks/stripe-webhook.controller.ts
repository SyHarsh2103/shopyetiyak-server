import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error.js";
import { bulkOrderService } from "../bulk-orders/bulk-order.service.js";
import { paymentService } from "../payments/payment.service.js";
import {
  StripeGatewayError,
  stripeGateway,
} from "../payments/stripe.gateway.js";

export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get("stripe-signature");
  if (!signature) {
    throw new ApiError(400, "STRIPE_SIGNATURE_REQUIRED", "Stripe signature header is required.");
  }

  const body: unknown = req.body;
  if (!Buffer.isBuffer(body)) {
    throw new ApiError(
      400,
      "STRIPE_RAW_BODY_REQUIRED",
      "Stripe webhook request body must be received as raw bytes.",
    );
  }

  try {
    const event = stripeGateway.constructWebhookEvent(body, signature);
    const isQuoteDeposit = event.paymentIntent
      ? await bulkOrderService.isQuoteDepositIntent(event.paymentIntent.id)
      : false;
    const result = isQuoteDeposit
      ? await bulkOrderService.processQuoteDepositWebhook(event)
      : await paymentService.processStripeWebhook(event);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof StripeGatewayError) {
      const status = [
        "STRIPE_NOT_CONFIGURED",
        "STRIPE_WEBHOOK_NOT_CONFIGURED",
      ].includes(error.code)
        ? 503
        : 400;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
}
