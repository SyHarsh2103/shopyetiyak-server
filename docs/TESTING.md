# Testing — Phase 2

Run:

```bash
npm run check
```

Phase 2 tests add coverage for:
- product validation
- duplicate variant identifiers within a product
- invalid sale pricing
- local storage safe filenames and deletion
- Admin RBAC catalog workflow
- category/brand/collection creation
- product creation
- product search by SKU
- duplicate SKU conflict
- safe category deletion
- product archival

Manual verification should also cover the Admin catalog screens and product image upload.

# Phase 3 Tests

`tests/inventory.validation.test.ts` verifies Phase 3 request-boundary rules.

`tests/inventory.service.test.ts` uses `MongoMemoryReplSet` because inventory services intentionally use MongoDB transactions. It verifies:

- two competing reservations cannot oversell one balance;
- FEFO consumes the earliest-expiring tracked batch first;
- reservation commit preserves the balance invariant;
- reservation release restores availability without changing on-hand stock;
- store transfers produce source and target balances;
- waste/damage adjustments create traceable movements;
- expected inventory transaction types are written to the ledger.

## Phase 4

Server tests added:
- `tests/purchasing.validation.test.ts`
- `tests/purchasing.service.test.ts`

The service test uses `MongoMemoryReplSet` because PO receiving and supplier returns use MongoDB transactions. It verifies approval/sent workflow, partial receiving, damaged quantity exclusion, inventory/batch creation, final receiving status, supplier last-cost tracking, and supplier returns.

## Phase 5

Server tests include public catalog validation plus a public catalog service integration test covering descendant-category lookup, selected-store inventory availability, sale-price projection, product detail stock and autocomplete.

## Phase 6 tests

```text
customer-account.validation.test.ts
customer-account.service.test.ts
```

Coverage includes profile/address validation, default addresses, wishlist persistence, grocery-list persistence, current pricing, store inventory, and reorder eligibility.


## Phase 7

- Cart request validation and bulk-import bounds
- Guest cart persistence
- Current price recalculation after catalog price changes
- Quantity/inventory validation
- Coupon discount calculation
- Guest checkout-review construction without order/payment creation

## Phase 8

Automated coverage adds:

- Payment request/idempotency validation.
- Backend checkout revalidation before PaymentIntent creation.
- Manual-capture selection for `VARIABLE_WEIGHT` carts.
- PaymentIntent creation idempotency.
- Stripe webhook event deduplication.
- Authorization state synchronization from PaymentIntent webhook data.
- Manual capture service flow.
- Full refund foundation and payment refund-status update.

The unit/integration tests use a fake Stripe gateway and MongoDB Memory Server. They do not call Stripe's network.

For interactive Stripe test-mode QA, use Stripe CLI forwarding to `/api/v1/webhooks/stripe` and Stripe test payment methods. Never use live credentials for local Phase 8 testing.

## Phase 9

Order service integration tests use `MongoMemoryReplSet`, not standalone `MongoMemoryServer`, because order creation and inventory reservation use MongoDB transactions. Tests cover snapshot creation, idempotent payment-to-order linkage, reservation ledger entries, Stripe/payment status synchronization, cart clearing and cancellation release.

## Phase 10

Automated coverage adds:

- picking request validation;
- variable-weight actual-weight capture;
- reservation reduction/release when actual quantity changes;
- unavailable-item reservation release;
- final fulfillment pricing recalculation;
- manual-capture settlement before inventory commit;
- transactional `ORDER_COMMIT` generation;
- FEFO batch depletion;
- Admin fulfillment API CSRF coverage in the Admin repository.

Fulfillment integration tests use `MongoMemoryReplSet` because picking/packing coordinate order, inventory, batches, payment state and history through MongoDB transactions.


## Phase 11

Automated coverage adds:

- delivery-zone/radius request validation;
- delivery and pickup slot time-window validation;
- server-authoritative delivery minimum and fee/free-threshold calculation;
- atomic capacity booking for capacity-1 delivery/pickup slots;
- slot release and rebooking semantics;
- Phase 9 order regression coverage confirming pickup capacity is released on failed payment/cancellation and restored on safe retry;
- Storefront fulfillment API request coverage;
- Admin Delivery/Pickup API method and CSRF coverage.

Capacity integration tests use `MongoMemoryReplSet` because order/slot/inventory consistency depends on MongoDB transactions.

## Phase 12

Run `npm run check` in Server, Admin, and Storefront. Server tests include promotion/coupon/bundle validation and promotion-engine calculations. Manually verify scheduled campaigns, coupon limits, automatic discounts, free-delivery promotions, Best Sellers ordering, banners, and bundle discounts.

## Phase 13

Phase 13 adds validation/API coverage for recipe ingredient mapping, Admin recipe API access, public recipe APIs, and meal-kit cart architecture. Manual QA must also confirm real inventory validation when adding recipe ingredients and meal-kit components to a selected store cart.

## Phase 14

Coverage includes inquiry/quote validation, negotiated quote totals, no-deposit acceptance semantics, Stripe deposit idempotency, Admin bulk-order API access and Storefront inquiry/private-quote API behavior. Manual QA must additionally cover SMTP quote delivery, Stripe test deposit webhook processing, delivery/pickup conversion and remaining-balance payment.

## Phase 15

Automated coverage adds:

- loyalty/store-credit/gift-card validation;
- backend-authoritative customer-value redemption quotes;
- customer balance summary behavior;
- gift-card issuance with hash-only code persistence;
- Customer/Admin customer-value API request coverage;
- checkout request typing for value redemptions.

Regression/manual QA must additionally verify:

- loyalty/store-credit/gift-card redemption against real checkout totals;
- zero-dollar internal payment completion when customer value covers the full order;
- atomic ledger debit during order creation;
- restoration on cancellation/full refund;
- loyalty earning only after successful payment and excluding redeemed loyalty value;
- final fulfillment reconciliation when picking reduces the order amount;
- gift-card expiry/disable/exhaustion behavior;
- back-in-stock subscription rejection while inventory is already available;
- SMTP dispatch after inventory becomes available.

## Phase 16
Run report validation/export tests and the standard `npm run check`. Manually compare report totals with representative orders, payments, inventory, goods receipts, and refunds.
