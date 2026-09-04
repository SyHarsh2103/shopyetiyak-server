# Customer Value Systems

Phase 15 adds backend-authoritative loyalty points, store credit, gift cards, and back-in-stock alerts.

## Ledger principle

Balances are not treated as freely editable fields. Every balance mutation creates an append-only transaction record with an idempotency key where the mutation can be retried by order/payment workflows.

Collections:

```text
loyaltyAccounts
loyaltyTransactions
storeCreditAccounts
storeCreditTransactions
giftCards
giftCardTransactions
backInStockSubscriptions
```

## Loyalty

Current Phase 15 policy:

```text
Earn: 1 point per whole currency unit of eligible merchandise
Redeem: 1 point = 1 minor currency unit
Minimum redemption: 100 points
```

Eligible merchandise is the order merchandise subtotal after discounts and after subtracting the portion paid with redeemed loyalty points. This prevents earning points on points redemption.

Order awards are idempotent. Full-refund handling reverses earned points conservatively without allowing a negative points balance.

## Store credit

Store credit is customer-specific and currency-specific. The account stores a cached balance, while `storeCreditTransactions` is the audit ledger. Checkout debits and cancellation/full-refund restorations occur transactionally with order state.

## Gift cards

Gift-card codes are generated once and returned to the Admin caller at issuance. Only a SHA-256 hash plus the final four normalized characters are persisted. Gift-card redemption supports guest and authenticated checkout.

Gift cards support `ACTIVE`, `DISABLED`, `EXHAUSTED`, and `EXPIRED` lifecycle states. Balance changes are recorded in `giftCardTransactions`.

## Checkout redemption order

When multiple value instruments are requested, the backend applies them in this order:

```text
1. Loyalty points
2. Store credit
3. Gift card
```

The backend caps all value redemption at the authoritative checkout amount. A zero remaining amount creates an internal successful payment record and does not create a Stripe PaymentIntent.

## Fulfillment reconciliation

Picking may reduce the final amount because of actual variable weight, unavailable items, or substitutions. Before packing settlement, Phase 15 recalculates the maximum prepaid value that can remain on the order and restores unused value in reverse redemption order:

```text
Gift card
Store credit
Loyalty points
```

This reconciliation is idempotent and recorded in the order customer-value snapshot.

## Cancellation and refund

Unconsumed order redemptions are restored on qualifying cancellation/payment-release paths and on full refunds. Loyalty earned from a fully refunded order is reversed. Dedicated proportional customer-value treatment for arbitrary partial post-fulfillment returns remains outside the Phase 15 initial scope and should be implemented with the future return/refund workflow rather than by silently mutating balances.

## Back-in-stock alerts

Customers or guests may subscribe to an unavailable store/product/variant combination. The subscription is stored only while the variant is unavailable.

Alerts can be dispatched from Admin or with:

```bash
npm run notify:back-in-stock
```

The dispatcher checks authoritative `Inventory.quantityAvailable` before sending SMTP notifications and marks successful subscriptions `NOTIFIED`. This command is suitable for a scheduled hosting job/cron. It is not a replacement for inventory data and does not change stock.

## Variable-weight authorization boundary

Customer value counts as prepaid value when fulfillment pricing changes. Existing Phase 10 payment-ceiling enforcement still applies: picking cannot increase the final amount beyond prepaid customer value plus the available Stripe authorization/capture ceiling. For a checkout fully covered by customer value, the picker must keep final fulfilled value within the prepaid amount because there is no separate Stripe authorization to increase. This prevents unsecured post-picking balances.
