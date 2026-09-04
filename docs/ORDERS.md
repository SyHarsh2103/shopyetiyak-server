# Orders — Phase 9

Phase 9 introduces persistent customer orders. MongoDB is authoritative for order history; Stripe remains authoritative for provider payment events.

## Creation workflow

1. Phase 7 rebuilds the checkout review using current catalog price, coupon, tax and inventory data.
2. Phase 8 creates/reuses a local Payment record.
3. Phase 9 starts a MongoDB transaction.
4. Inventory is reserved for every active cart line using the existing `ORDER_RESERVATION` ledger flow.
5. The Order and immutable product/pricing/contact/store snapshots are created.
6. `payments.orderId` is linked to the Order in the same transaction.
7. An immutable `PENDING_PAYMENT` status-history record is written.
8. Stripe PaymentIntent creation continues using the linked payment/order identifiers.

Actual inventory commitment is intentionally deferred to Phase 10 fulfillment. Cancellation and fully refunded orders release active reservations using `ORDER_RELEASE` ledger entries.

## Status separation

`paymentStatus` and `orderStatus` are independent fields. Validated Stripe/server payment changes synchronize only the payment-related order states. Operational statuses such as picking and packing remain Phase 10.

## Snapshots

Orders retain product name, slug, SKU, product type, selling unit, variant attributes, image reference, requested quantity, unit price, line subtotal, discount and tax snapshots. Historical orders therefore do not change when the current catalog changes.

## APIs

Customer/guest confirmation:
- `GET /api/v1/orders/:orderId`

Authenticated customer:
- `GET /api/v1/customer/account/orders`
- `GET /api/v1/customer/account/orders/:orderNumber`
- `POST /api/v1/customer/account/orders/:orderNumber/reorder`
- `POST /api/v1/customer/account/orders/:orderNumber/cancel`

Admin:
- `GET /api/v1/admin/orders`
- `GET /api/v1/admin/orders/:orderId`
- `PATCH /api/v1/admin/orders/:orderId/status`
- `POST /api/v1/admin/orders/:orderId/cancel`
- `POST /api/v1/admin/orders/:orderId/refunds`

Admin writes require CSRF and the appropriate RBAC permission.

## Phase 10 fulfillment lifecycle

Operational fulfillment now advances eligible orders through:

```text
PAYMENT_AUTHORIZED / CONFIRMED / PROCESSING
              ↓
           PICKING
              ↓
           PACKING
              ↓
READY (delivery) / READY_FOR_PICKUP (pickup)
```

Each order line retains the original checkout snapshot while recording a separate fulfillment result. Variable-weight lines store actual picked weight. Unavailable lines contribute zero to final fulfillment pricing. Substitutions are stored in `orderSubstitutions` and linked to the original order item.

`fulfillmentPricing` is recalculated by the backend and may decrease from the original checkout total. It may not exceed the current Stripe authorization/capture ceiling. Packing completion settles the final payment, commits reserved inventory and records bag count/notes before advancing the order to Ready.
