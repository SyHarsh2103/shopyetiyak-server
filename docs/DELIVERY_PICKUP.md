# Delivery and Pickup — Phase 11

## Scope

Phase 11 adds backend-authoritative delivery eligibility, delivery/pickup scheduling, capacity reservation, and final delivery/pickup operational transitions. It builds on the Phase 10 packing workflow, which hands completed orders to `READY` for delivery or `READY_FOR_PICKUP` for pickup.

Phase 12 promotions are not part of this module.

## Delivery Zones

`deliveryZones` are store-specific configuration records.

A zone stores:

- store
- name
- normalized postal/ZIP codes
- minimum merchandise subtotal
- base delivery fee
- optional free-delivery threshold
- enabled weekdays
- active/inactive state
- optional radius and center coordinates for radius-eligibility architecture

Current Phase 11 customer eligibility is authoritative by normalized postal/ZIP code. One ZIP cannot belong to two active zones in the same store, preventing ambiguous fee/minimum rules. Public delivery also requires the store to have delivery enabled. Radius fields are retained for future geospatial expansion and are not silently used as a substitute for ZIP matching.

## Delivery Fee Rules

The server calculates delivery fees from the resolved zone after the cart has been re-priced and discounts have been applied.

```text
merchandiseMinor = subtotalMinor - discountMinor
```

Rules:

1. Merchandise must meet `minimumOrderMinor`.
2. If a free-delivery threshold exists and merchandise meets it, fee is zero.
3. Otherwise the configured `deliveryFeeMinor` is charged.
4. Browser-submitted delivery fees are never authoritative.

## Delivery Slots

`deliverySlots` are store-specific and may optionally target one zone. A `null` zone applies to all active zones for that store.

Each slot stores:

- date
- start/end local time
- store timezone
- capacity
- booked count
- cutoff minutes
- calculated absolute `cutoffAt`
- status

Public availability excludes:

- inactive slots
- slots past cutoff
- full slots
- slots on weekdays not enabled by the resolved delivery zone

## Pickup Slots

`pickupSlots` use the same timezone/capacity/cutoff principles without a delivery zone. Pickup is offered only by an active store with `pickupEnabled=true`.

## Capacity Concurrency

Checkout slot lists are previews only. Capacity becomes authoritative when the persistent Order is created.

Order creation and capacity reservation run in the same MongoDB transaction. The slot update uses a conditional expression equivalent to:

```text
bookedCount < capacity
```

Only a successful conditional update increments the booking count. Concurrent orders cannot intentionally reserve beyond capacity.

## Slot Lifecycle

Order slot reservation state is independent of order/payment state:

```text
ACTIVE
RELEASED
FULFILLED
```

- Order creation: `ACTIVE`
- PaymentIntent-creation failure that releases the order: `RELEASED`
- Safe payment retry: same stored slot is transactionally re-reserved and returns to `ACTIVE`
- Eligible cancellation/full release: `RELEASED`
- Delivery completed / pickup completed: `FULFILLED`

A released slot decrements its `bookedCount` only when the order currently owns an active reservation.

## Historical Snapshots

Orders store immutable scheduling snapshots:

### Delivery

- delivery zone ID/name/rules
- delivery slot ID
- date
- start/end time
- timezone

### Pickup

- pickup slot ID
- date
- start/end time
- timezone

Changing a zone or slot later does not rewrite historical orders.

## Delivery Workflow

Phase 10 packing produces:

```text
PACKING
  ↓
READY
```

Phase 11 continues:

```text
READY
  ↓
OUT_FOR_DELIVERY
  ↓
DELIVERED
```

Inventory must already be `COMMITTED` before an order can leave the store. `DELIVERED` marks the fulfillment slot reservation `FULFILLED`.

## Pickup Workflow

Phase 10 packing produces:

```text
PACKING
  ↓
READY_FOR_PICKUP
```

Phase 11 continues:

```text
READY_FOR_PICKUP
  ↓
PICKED_UP
```

Inventory must already be `COMMITTED`. `PICKED_UP` marks the fulfillment slot reservation `FULFILLED`.

## Public API

```text
GET /api/v1/delivery/eligibility?storeId=:storeId&postalCode=:postalCode
GET /api/v1/delivery/slots?storeId=:storeId&postalCode=:postalCode&date=:date
GET /api/v1/pickup/slots?storeId=:storeId&date=:date
```

Checkout review accepts one of:

```text
deliverySlotId
pickupSlotId
```

according to `fulfillmentType`.

## Admin API

Delivery configuration/operations:

```text
GET   /api/v1/admin/delivery/zones
POST  /api/v1/admin/delivery/zones
PATCH /api/v1/admin/delivery/zones/:id
GET   /api/v1/admin/delivery/slots
POST  /api/v1/admin/delivery/slots
PATCH /api/v1/admin/delivery/slots/:id
GET   /api/v1/admin/delivery/orders
POST  /api/v1/admin/delivery/orders/:orderId/out-for-delivery
POST  /api/v1/admin/delivery/orders/:orderId/delivered
```

Pickup configuration/operations:

```text
GET   /api/v1/admin/pickup/slots
POST  /api/v1/admin/pickup/slots
PATCH /api/v1/admin/pickup/slots/:id
GET   /api/v1/admin/pickup/orders
POST  /api/v1/admin/pickup/orders/:orderId/picked-up
```

## RBAC

Phase 11 adds:

```text
delivery.read
delivery.manage
pickup.read
pickup.manage
```

Admin mutations also require Admin CSRF protection and are audit logged.

## Timezone Safety

Slot date/time is entered in the store timezone. The backend converts the start time to an absolute UTC instant and stores `cutoffAt`. Public and reservation queries compare against that absolute instant, avoiding server-host timezone assumptions.

Historical order slot snapshots retain the store timezone for display.
