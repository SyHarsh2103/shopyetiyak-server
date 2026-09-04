# Stripe — Phase 8

## Scope

Phase 8 uses Stripe PaymentIntents and Stripe Elements in test mode. It implements payment records, authorization/capture architecture, webhook verification/deduplication, idempotency, failure state storage, Admin capture/cancel operations, and refund foundation.

Phase 9 now creates and links the persistent Order before Stripe confirmation; Stripe payment state remains separate from order state.

## Environment

Backend only:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Storefront only:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Never place a Stripe secret key or webhook signing secret in a `NEXT_PUBLIC_*` variable.

## Payment flow

```text
Cart
  ↓
POST /checkout/review
  ↓
Backend recalculates authoritative totals
  ↓
POST /payments/intents + application idempotency key
  ↓
Backend rebuilds checkout review
  ↓
Payment record + PaymentAttempt
  ↓
Stripe PaymentIntent
  ↓
Stripe Payment Element confirms payment
  ↓
Stripe webhook signature verification
  ↓
Webhook event deduplication
  ↓
Payment status synchronized in MongoDB
```

### Capture selection

- Standard cart: `AUTOMATIC` capture.
- Cart containing `VARIABLE_WEIGHT`: `MANUAL` capture.

Manual capture supports later grocery fulfillment adjustments. Phase 10 will provide actual-weight/substitution calculation and inventory fulfillment behavior.

## Local webhook testing

Run the API on port 4000, then in a second terminal use Stripe CLI:

```bash
stripe login
stripe listen --forward-to http://localhost:4000/api/v1/webhooks/stripe
```

Copy the `whsec_...` signing secret printed by Stripe CLI into the server `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the server.

## Test payment

Use only Stripe test-mode payment methods. For a normal successful card test, Stripe documents `4242 4242 4242 4242` with a future expiry and any valid CVC.

## Idempotency

The client supplies an opaque idempotency key for PaymentIntent creation. The server:

1. hashes the raw key before MongoDB persistence;
2. creates a unique `paymentAttempts.idempotencyKeyHash` record;
3. sends a derived key to Stripe;
4. returns the existing PaymentIntent on a safe retry.

Admin capture/cancel/refund operations use the same principle with operation-specific attempts.

## Webhook authority

The storefront never marks the grocery-side payment record successful merely because client-side confirmation returned success. Stripe webhook/server synchronization is authoritative for the stored payment state.

## Phase boundary

Phase 8 does not:

- create an Order document;
- reserve or commit inventory for an order;
- create an order number;
- write order status history;
- perform Phase 10 actual-weight fulfillment;
- implement Phase 11 delivery-slot capacity.

Those concerns remain in their designated phases.

## Retry and recovery behavior

- Completed idempotent PaymentIntent/capture/cancel/refund operations return their previously persisted/provider result instead of repeating the financial operation.
- Reusing an idempotency key for a different payment operation or a different capture/refund amount is rejected.
- A Stripe event already marked `PROCESSED` or `IGNORED` is acknowledged as a duplicate.
- A previously `FAILED`/unfinished webhook event can be retried with the same Stripe event ID and processed again safely.
- Webhook test/live mode is checked against the configured Stripe server credential mode after signature verification.

## Phase 10 fulfillment settlement

Variable-weight orders using manual capture remain authorized while picking occurs. Phase 10 recalculates final fulfillment pricing from actual weights, unavailable items and substitutions. The final total is not allowed to exceed the existing Stripe authorization/capture ceiling.

At packing completion:

- an authorized manual-capture PaymentIntent is captured for the exact final fulfillment amount using a deterministic idempotency key;
- an already captured automatic payment is refunded for any fulfillment reduction using a deterministic idempotency key;
- inventory is committed only after the grocery-side payment record shows net captured funds exactly equal to the final fulfillment total.

The fulfillment UI never performs privileged Stripe actions directly.
