# Database — Phase 2

Phase 1 collections remain in place. Phase 2 adds:

- `categories`
- `brands`
- `collections`
- `products`

## Categories
Categories are database-driven and nested using `parentId`. Slugs are unique. Safe deletion prevents removal when children or products reference a category.

## Brands
Brands use unique slugs and can be activated/deactivated. Physical deletion is blocked while products reference the brand.

## Collections
Collections are flexible merchandising groupings rather than hard-coded storefront categories. One product may reference multiple collections.

## Products
Products contain core catalog metadata plus embedded variant and image metadata. Product documents reference brand/category/collection records.

Important indexes include:
- unique `products.slug`
- unique multikey `products.variants.sku`
- sparse unique multikey barcode/UPC/EAN indexes
- product category, collection and brand query indexes
- product activity/archive indexes
- text index over product name, short description and tags

Product archival uses `archivedAt` and `isActive=false`; Phase 2 does not physically delete product records.

## Money
Variant prices are persisted in smallest currency units:
- `costPriceMinor`
- `regularPriceMinor`
- `salePriceMinor`

The currency is stored with the variant pricing record.

# Phase 3 Collections

## storeLocations

Stores physical location, code, address, timezone, fulfillment flags, business hours, and status.

Indexes:

```text
code unique
status + name
```

## storeProducts

Store-specific product availability and pickup/delivery flags.

Unique logical key:

```text
storeId + productId
```

## inventories

Store/product/variant balance record.

Unique logical key:

```text
storeId + productId + variantId
```

## inventoryBatches

Batch and expiry inventory used by FEFO.

Unique logical key:

```text
storeId + productId + variantId + batchNumber
```

## inventoryTransactions

Immutable stock movement ledger with before/after balances and movement deltas.

## Phase 4 Collections

### suppliers
Supplier company/contact/address/payment/tax/status master data.

### supplierProducts
Unique supplier + product + variant mappings with supplier SKU, unit cost, MOQ, lead time, preferred-source flag, and latest received cost.

### purchaseOrders
Purchase order header plus product/variant snapshots, ordered/received quantities, minor-unit costs, workflow timestamps, supplier and destination store.

### goodsReceipts
Immutable receipt records containing delivered, damaged, accepted quantities, batch references, actual receipt costs, and receipt currency.

### supplierReturns
Supplier batch returns with quantity, cost/currency snapshots, reason, value, and optional PO/receipt references.

## Phase 6 — Customer Account Data

The existing `users` collection now stores a bounded address book directly on each customer (`phone`, `addresses[]`). Addresses are embedded because they belong only to one customer and have a small lifecycle.

New collections:

```text
wishlists
  customerId (unique)
  items[] { productId, variantId, addedAt }

shoppingLists
  customerId
  name
  nameKey
  items[] { productId, variantId, quantity, addedAt }
```

Indexes:

```text
wishlists.customerId unique
shoppingLists.customerId + nameKey unique
shoppingLists.customerId + updatedAt
```


## Phase 7 Collections

### carts

One cart per customer/store or guest-token/store. Cart items persist only product ID, variant ID, quantity, saved-for-later state, and timestamp. Prices are intentionally not stored as authoritative cart data. Guest carts expire through a TTL index.

### coupons

Phase 7 introduces the coupon-validation foundation supporting fixed and percentage discounts, active dates, store restrictions, currency, minimum subtotal, and maximum discount. Advanced promotion rules and administration remain Phase 12.


### taxRules

Phase 7 adds a Mongo-backed tax service. Rules can target country/state/city/postal code, product tax classification, or a specific product, with effective dates and basis-point rates. No tax rate is hard-coded in application code.

## Phase 8 Collections

### payments

Stores the grocery-side Stripe payment record. Important fields include optional `orderId`, customer/guest ownership, cart/store references, Stripe PaymentIntent ID, checkout fingerprint, smallest-unit amounts, capture method, independent payment status, fulfillment type, and sanitized last-error details.

`orderId` is intentionally nullable in Phase 8 and is linked by the Phase 9 order workflow.

### paymentAttempts

Immutable/idempotent operation attempts for PaymentIntent creation, capture, cancellation and refund. `idempotencyKeyHash` is unique; raw idempotency keys are not persisted.

### refunds

Stores refund requests/results independently from payments, including amount, currency, requesting Admin, Stripe refund ID, idempotency hash, status and failure reason.

### stripeWebhookEvents

Stores Stripe event IDs with a unique index for webhook deduplication, event type, provider timestamp, optional PaymentIntent ID and processing result.

All monetary values remain in minor currency units.

## Phase 9 Collections

### `orders`
Persistent order aggregate with unique `orderNumber` and unique `paymentId`, customer/guest ownership, immutable checkout snapshots, separate payment/order status, inventory reservation state, fulfillment snapshot, pricing snapshot and cancellation metadata.

Important indexes include customer/date, store/status/date, payment status/date, order status/date and unique order/payment identifiers.

### `orderStatusHistories`
Append-only order status timeline with actor type, optional actor ID/roles, transition and note. Indexed by order/date and order number/date.

`payments.orderId` is now populated by Phase 9 and links the financial record to its authoritative order.

## Phase 10 Collections and Order Fields

### `orderSubstitutions`
Stores the original order-line reference and an immutable replacement-product snapshot, replacement quantity/pricing/tax, approval evidence, reason, selected batch, remaining reserved replacement quantity and lifecycle status. An active substitution is unique per order item.

### Phase 10 `orders` additions
Order lines now track fulfillment status (`PENDING`, `PICKED`, `SUBSTITUTED`, `UNAVAILABLE`), inventory disposition (`RESERVED`, `RELEASED`, `COMMITTED`), picked quantity/actual weight, reserved quantity, selected batch and final fulfilled line pricing. The order retains a separate `fulfillmentPricing` aggregate plus picking and packing timestamps/actor references. The original Phase 9 checkout `pricing` snapshot remains unchanged.


## Phase 11 Collections and Order Fields

### `deliveryZones`
Store-specific normalized ZIP/postal-code eligibility, minimum merchandise amount, delivery fee, optional free-delivery threshold, enabled weekdays, active status, and optional radius/center coordinates for future geospatial eligibility.

### `deliverySlots`
Store/optional-zone scheduling record with local date/time, store timezone, capacity, booked count, cutoff minutes, absolute cutoff timestamp and status. A compound unique index prevents duplicate store/zone/date/time windows.

### `pickupSlots`
Store pickup schedule with local date/time, timezone, capacity/booked count, cutoff and status.

### Phase 11 `orders` additions
Orders now retain immutable delivery-zone and delivery/pickup-slot snapshots plus `fulfillmentSlotReservationStatus` (`ACTIVE`, `RELEASED`, `FULFILLED`). Slot capacity is reserved in the same transaction as order creation and released transactionally with qualifying order/payment release paths.

## Phase 12 collections

- `promotions`
- `couponRedemptions`
- `banners`
- `bundles`

The existing `coupons` collection was extended with usage/targeting/stacking rules. The existing `collections` collection now supports merchandising type plus campaign start/end dates.

## Phase 13 Collections

### `recipes`

Stores recipe editorial content and commerce mappings:

```text
name / slug
shortDescription / description
imageUrl
preparationMinutes / cookingMinutes / servings
cuisine / dietary[]
steps[]
ingredients[]
  name / amount / unit / note
  optional
  productId / variantId
  cartQuantity
mealKitBundleId
isFeatured / isActive
seo
```

Ingredient product mappings are optional, but `productId` and `variantId` must be configured together. Historical inventory is not duplicated in recipes. Cart actions resolve recipe mappings into the authoritative Product/Variant/Inventory pipeline.

The existing `bundles` collection now includes `bundleType` (`STANDARD` or `MEAL_KIT`). A meal kit has no independent inventory balance; its component products remain the stock source of truth.

## Phase 14 collections

- `bulkOrderRequests`: bulk/wedding/party inquiry and lead lifecycle.
- `quotes`: negotiated quote snapshots, deposit terms, private access-token hash and conversion reference.
- `quoteDepositPayments`: Stripe deposit PaymentIntent lifecycle and idempotency.

Orders converted from quotes use `source: QUOTE`, `quoteSnapshot`, and `pricing.prepaidAmountMinor`. Product inventory continues to use existing `inventories` and inventory-transaction records; custom quote lines never create inventory.

## Phase 15 Collections and Order Fields

### `loyaltyAccounts` / `loyaltyTransactions`

Customer points account plus append-only earn/redeem/adjustment/expiration/refund/reversal ledger. Transaction idempotency keys prevent duplicate order awards or restoration.

### `storeCreditAccounts` / `storeCreditTransactions`

Customer/currency store-credit account plus signed money ledger in minor units. Redemption and restoration are coordinated with order MongoDB transactions.

### `giftCards` / `giftCardTransactions`

Gift-card records persist only the SHA-256 code hash and final four normalized characters. The transaction ledger records issuance, redemption, adjustment and restoration. Statuses are `ACTIVE`, `DISABLED`, `EXHAUSTED`, `EXPIRED`.

### `backInStockSubscriptions`

Store/product/variant/email subscription with active/notified/cancelled state, notification timestamp and hashed cancellation token.

### Phase 15 `orders` / `payments` additions

Orders now optionally persist a `customerValueSnapshot` containing redeemed loyalty/store-credit/gift-card value, earned loyalty, restoration amounts and fulfillment reconciliation timestamps. `pricing.prepaidAmountMinor` is used for customer-value redemptions as well as existing quote deposits.

`payments.provider` now supports `INTERNAL` in addition to `STRIPE`. `INTERNAL` is used only when backend-authoritative customer value fully covers the amount due; no Stripe PaymentIntent is created for a zero remaining amount.

## Phase 16 Reporting
No analytics shadow database is introduced. Reports query authoritative operational collections. `orders.items.costPriceMinorSnapshot` is added for future historical profitability accuracy.

## Admin account setup tokens

Collection: `adminAccountTokens`

Key fields:

```text
adminUserId
purpose: ACCOUNT_SETUP | PASSWORD_RESET
tokenHash
expiresAt
usedAt
createdByAdminUserId
createdAt
updatedAt
```

Indexes include a unique token hash, lookup index by admin/purpose/status, and TTL expiry on `expiresAt`.

`adminUsers` additionally tracks `mustSetPassword`, `invitedAt`, and `passwordChangedAt` while preserving the existing email, password hash, role IDs, active state, and last login fields.
