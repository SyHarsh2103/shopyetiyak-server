# API — Phase 2

Base URL: `/api/v1`

Phase 1 authentication remains unchanged.

## Admin catalog API

All catalog routes require an authenticated Admin session. Read routes require `catalog.read`; mutation routes additionally require the operation-specific permission and Admin CSRF token.

### Categories
- `GET /admin/catalog/categories`
- `GET /admin/catalog/categories/:id`
- `POST /admin/catalog/categories`
- `PATCH /admin/catalog/categories/:id`
- `DELETE /admin/catalog/categories/:id`

Category deletion is rejected while child categories or any product still reference the category.

### Brands
- `GET /admin/catalog/brands`
- `GET /admin/catalog/brands/:id`
- `POST /admin/catalog/brands`
- `PATCH /admin/catalog/brands/:id`
- `DELETE /admin/catalog/brands/:id`

Brand deletion is rejected while any product references the brand.

### Collections
- `GET /admin/catalog/collections`
- `GET /admin/catalog/collections/:id`
- `POST /admin/catalog/collections`
- `PATCH /admin/catalog/collections/:id`
- `DELETE /admin/catalog/collections/:id`

Collection deletion is rejected while any product references it.

### Products
- `GET /admin/catalog/products?page=1&limit=20&search=&active=true|false`
- `GET /admin/catalog/products/:id`
- `POST /admin/catalog/products`
- `PATCH /admin/catalog/products/:id`
- `DELETE /admin/catalog/products/:id` — archives instead of physically deleting

Product variants are mandatory. The API validates cross-product SKU/barcode/UPC/EAN uniqueness and validates referenced categories, collections, brands and related products.

### Product images
- `POST /admin/catalog/product-images` — multipart field `file`, optional `altText`
- `DELETE /admin/catalog/product-images` — deletes only an unattached image by `storageKey`

Accepted image MIME types: JPEG, PNG, WebP and AVIF. Maximum file size: 5 MB.

Responses continue to use `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.

# Phase 3 — Stores and Inventory

## Stores

```text
GET    /api/v1/admin/stores/locations
GET    /api/v1/admin/stores/locations/:id
POST   /api/v1/admin/stores/locations
PATCH  /api/v1/admin/stores/locations/:id
GET    /api/v1/admin/stores/products
PUT    /api/v1/admin/stores/products
```

## Inventory

```text
GET    /api/v1/admin/inventory
PATCH  /api/v1/admin/inventory/:id/reorder-policy
POST   /api/v1/admin/inventory/adjustments
POST   /api/v1/admin/inventory/reservations
POST   /api/v1/admin/inventory/reservations/release
POST   /api/v1/admin/inventory/reservations/commit
POST   /api/v1/admin/inventory/transfers
GET    /api/v1/admin/inventory/batches
POST   /api/v1/admin/inventory/batches/receive
GET    /api/v1/admin/inventory/transactions
```

All endpoints require Admin authentication. Mutations require Admin CSRF validation and the corresponding granular permission.

## Phase 4 — Suppliers and Purchasing

### Suppliers
- `GET /api/v1/admin/suppliers`
- `GET /api/v1/admin/suppliers/:id`
- `POST /api/v1/admin/suppliers`
- `PATCH /api/v1/admin/suppliers/:id`
- `GET /api/v1/admin/suppliers/products/list`
- `PUT /api/v1/admin/suppliers/products/map`

### Purchasing
- `GET /api/v1/admin/purchasing/purchase-orders`
- `GET /api/v1/admin/purchasing/purchase-orders/:id`
- `POST /api/v1/admin/purchasing/purchase-orders`
- `PATCH /api/v1/admin/purchasing/purchase-orders/:id`
- `POST /api/v1/admin/purchasing/purchase-orders/:id/status`
- `GET /api/v1/admin/purchasing/goods-receipts`
- `POST /api/v1/admin/purchasing/goods-receipts`
- `GET /api/v1/admin/purchasing/supplier-returns`
- `POST /api/v1/admin/purchasing/supplier-returns`

## Phase 5 Public Catalog API

Public endpoints do not require customer or admin authentication.

```text
GET /api/v1/catalog/home
GET /api/v1/catalog/stores
GET /api/v1/catalog/categories
GET /api/v1/catalog/categories/:slug
GET /api/v1/catalog/collections
GET /api/v1/catalog/collections/:slug
GET /api/v1/catalog/brands
GET /api/v1/catalog/products
GET /api/v1/catalog/products/:slug
GET /api/v1/catalog/search/suggestions
```

Product listing supports `storeId`, `q`, `category`, `collection`, `brand`, `minPriceMinor`, `maxPriceMinor`, `inStock`, dietary flags, `country`, `discount`, `unit`, `size`, `sort`, `page`, and `limit`.

Supported Phase 5 sort modes are `recommended`, `newest`, `price_asc`, `price_desc`, and `discount`. Highest-rated and order-derived best-selling ranking are not fabricated before review/order data exists.

## Phase 6 — Customer Account API

All routes below require customer authentication. Mutation routes also require the customer CSRF token.

```text
GET    /api/v1/customer/account/dashboard
PATCH  /api/v1/customer/account/profile
GET    /api/v1/customer/account/addresses
POST   /api/v1/customer/account/addresses
PATCH  /api/v1/customer/account/addresses/:addressId
DELETE /api/v1/customer/account/addresses/:addressId
GET    /api/v1/customer/account/wishlist
POST   /api/v1/customer/account/wishlist/items
DELETE /api/v1/customer/account/wishlist/items/:productId/:variantId
GET    /api/v1/customer/account/shopping-lists
POST   /api/v1/customer/account/shopping-lists
PATCH  /api/v1/customer/account/shopping-lists/:listId
DELETE /api/v1/customer/account/shopping-lists/:listId
POST   /api/v1/customer/account/shopping-lists/:listId/items
PATCH  /api/v1/customer/account/shopping-lists/:listId/items/:productId/:variantId
DELETE /api/v1/customer/account/shopping-lists/:listId/items/:productId/:variantId
GET    /api/v1/customer/account/orders
POST   /api/v1/customer/account/reorder/validate
```

`reorder/validate` does not create a cart or order. It validates future historical-order item references against current product status, variant status, current price, store-product availability, and store inventory.


## Phase 7 — Cart and Checkout Foundation

Public-to-customer cart endpoints use optional customer authentication. Guest ownership is maintained with an opaque HttpOnly cookie. All write operations require the customer CSRF token, including guest cart writes.

```text
GET    /api/v1/cart?storeId=:storeId
POST   /api/v1/cart/items
POST   /api/v1/cart/items/bulk
PATCH  /api/v1/cart/items/:productId/:variantId
PATCH  /api/v1/cart/items/:productId/:variantId/state
DELETE /api/v1/cart/items/:productId/:variantId
POST   /api/v1/cart/coupon
DELETE /api/v1/cart/coupon
DELETE /api/v1/cart
POST   /api/v1/checkout/review
```

The backend recalculates current product price, quantity rules, store availability, and inventory on every cart quote and checkout review. Browser-submitted price or total fields are not accepted.

## Phase 8 — Stripe Payments

Customer/guest payment endpoints use the same optional customer-session and guest-cart ownership model as Phase 7. PaymentIntent creation requires customer CSRF protection and always rebuilds the checkout review on the backend before sending an amount to Stripe.

```text
POST /api/v1/payments/intents
GET  /api/v1/payments/:paymentId
POST /api/v1/webhooks/stripe
```

`POST /payments/intents` accepts the Phase 7 checkout-review payload plus an `idempotencyKey`. Browser-submitted amount, currency, discount, tax and total fields are not accepted.

Administrative financial operations are backend-only, require Admin authentication, Admin CSRF protection and a granular permission:

```text
POST /api/v1/admin/payments/:paymentId/capture   payments.capture
POST /api/v1/admin/payments/:paymentId/cancel    payments.cancel
POST /api/v1/admin/payments/:paymentId/refunds   payments.refund
```

Phase 8 introduced nullable `payments.orderId`; Phase 9 now creates the persistent Order transactionally and links that field before Stripe confirmation.

## Phase 9 — Orders

Persistent orders are now created and linked to Phase 8 Payment records before Stripe confirmation. The backend stores checkout snapshots and reserves inventory transactionally.

- `GET /api/v1/orders/:orderId` — guest/customer owner-safe order confirmation detail.
- `GET /api/v1/customer/account/orders` — paginated authenticated customer order history.
- `GET /api/v1/customer/account/orders/:orderNumber` — customer order detail and timeline.
- `POST /api/v1/customer/account/orders/:orderNumber/reorder` — rebuild cart with current availability validation.
- `POST /api/v1/customer/account/orders/:orderNumber/cancel` — cancel eligible uncaptured customer orders.
- `GET /api/v1/admin/orders` — filter/search/paginate orders (`orders.read`).
- `GET /api/v1/admin/orders/:orderId` — admin order detail (`orders.read`).
- `PATCH /api/v1/admin/orders/:orderId/status` — Phase 9 processing transition (`orders.update`).
- `POST /api/v1/admin/orders/:orderId/cancel` — cancellation with optional captured-fund refund (`orders.cancel`).
- `POST /api/v1/admin/orders/:orderId/refunds` — Phase 8 refund integration (`payments.refund`).

## Phase 10 — Grocery Fulfillment

Picker endpoints are Admin-authenticated and permission protected:

```text
GET   /api/v1/admin/picking/orders
GET   /api/v1/admin/picking/orders/:orderId
POST  /api/v1/admin/picking/orders/:orderId/start
PATCH /api/v1/admin/picking/orders/:orderId/items/:orderItemId/picked
POST  /api/v1/admin/picking/orders/:orderId/items/:orderItemId/unavailable
GET   /api/v1/admin/picking/orders/:orderId/items/:orderItemId/batches
GET   /api/v1/admin/picking/orders/:orderId/items/:orderItemId/substitution-candidates
POST  /api/v1/admin/picking/orders/:orderId/items/:orderItemId/substitute
POST  /api/v1/admin/picking/orders/:orderId/complete
```

Packing endpoints:

```text
GET  /api/v1/admin/packing/orders
GET  /api/v1/admin/packing/orders/:orderId
POST /api/v1/admin/packing/orders/:orderId/complete
```

Picking mutations require `fulfillment.picking.manage`; packing completion requires `fulfillment.packing.manage`. Read endpoints use their corresponding `.read` permission. All mutation endpoints require Admin CSRF protection.


## Phase 11 — Delivery and Pickup

Public eligibility/scheduling endpoints:

```text
GET /api/v1/delivery/eligibility?storeId=:storeId&postalCode=:postalCode
GET /api/v1/delivery/slots?storeId=:storeId&postalCode=:postalCode&date=:date
GET /api/v1/pickup/slots?storeId=:storeId&date=:date
```

Checkout review now requires a valid `deliverySlotId` or `pickupSlotId` according to fulfillment type. Delivery fees, minimums, free-delivery thresholds, slot cutoff and capacity are server-authoritative.

Admin Delivery:

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

Admin Pickup:

```text
GET   /api/v1/admin/pickup/slots
POST  /api/v1/admin/pickup/slots
PATCH /api/v1/admin/pickup/slots/:id
GET   /api/v1/admin/pickup/orders
POST  /api/v1/admin/pickup/orders/:orderId/picked-up
```

Permissions: `delivery.read`, `delivery.manage`, `pickup.read`, `pickup.manage`. Admin writes require Admin CSRF protection.

## Phase 12 — Marketing

Public:
- `GET /api/v1/marketing`
- `GET /api/v1/catalog/products?sort=best_selling`

Admin:
- `GET|POST /api/v1/admin/marketing/promotions`
- `PATCH /api/v1/admin/marketing/promotions/:id`
- `GET|POST /api/v1/admin/marketing/coupons`
- `PATCH /api/v1/admin/marketing/coupons/:id`
- `GET|POST /api/v1/admin/marketing/banners`
- `PATCH /api/v1/admin/marketing/banners/:id`
- `GET|POST /api/v1/admin/marketing/bundles`
- `PATCH /api/v1/admin/marketing/bundles/:id`

## Phase 13 — Recipes and Meal Kits

Public recipe APIs:

```text
GET  /api/v1/recipes
GET  /api/v1/recipes/:slug
POST /api/v1/recipes/:slug/cart
POST /api/v1/recipes/:slug/meal-kit/cart
GET  /api/v1/meal-kits
POST /api/v1/meal-kits/:slug/cart
```

Recipe and meal-kit cart mutations use the existing customer/guest cart security model and require customer CSRF protection. The backend expands mapped recipe ingredients or meal-kit bundle components into real product/variant cart lines and reuses the existing inventory/quantity validation pipeline.

Admin recipe APIs:

```text
GET   /api/v1/admin/recipes
POST  /api/v1/admin/recipes
PATCH /api/v1/admin/recipes/:id
```

Permissions: `content.read` and `content.manage`. Admin writes require Admin CSRF protection and create audit events.

## Phase 14 — Bulk Orders and Quotes

Public/customer:
- `POST /api/v1/bulk-orders/requests`
- `GET /api/v1/bulk-orders/quotes/:id?token=`
- `POST /api/v1/bulk-orders/quotes/:id/accept?token=`
- `POST /api/v1/bulk-orders/quotes/:id/deposit-intent?token=`
- `POST /api/v1/bulk-orders/quotes/:id/order-payment-intent?token=`

Admin:
- `GET /api/v1/admin/bulk-orders/requests`
- `PATCH /api/v1/admin/bulk-orders/requests/:id`
- `GET /api/v1/admin/bulk-orders/quotes`
- `POST /api/v1/admin/bulk-orders/quotes`
- `PATCH /api/v1/admin/bulk-orders/quotes/:id`
- `POST /api/v1/admin/bulk-orders/quotes/:id/send`
- `POST /api/v1/admin/bulk-orders/quotes/:id/cancel`
- `POST /api/v1/admin/bulk-orders/quotes/:id/convert`

## Phase 15 — Customer Value Systems

Customer/public:

```text
GET  /api/v1/customer-value/gift-cards/balance?code=
POST /api/v1/customer-value/back-in-stock
POST /api/v1/customer-value/back-in-stock/cancel
GET  /api/v1/customer-value/account
```

`GET /account` requires Customer authentication. Gift-card balance checks and public back-in-stock mutations are rate-limited. Back-in-stock writes use Customer CSRF protection, support guest email subscriptions, and associate the customer ID when a valid customer session is present. Gift-card balance lookup never exposes the stored hash.

Admin:

```text
GET   /api/v1/admin/customer-value/customers
POST  /api/v1/admin/customer-value/loyalty/adjust
POST  /api/v1/admin/customer-value/store-credit/adjust
GET   /api/v1/admin/customer-value/gift-cards
POST  /api/v1/admin/customer-value/gift-cards
POST  /api/v1/admin/customer-value/gift-cards/:giftCardId/adjust
PATCH /api/v1/admin/customer-value/gift-cards/:giftCardId/status
GET   /api/v1/admin/customer-value/back-in-stock
POST  /api/v1/admin/customer-value/back-in-stock/dispatch
```

Admin mutations require Admin CSRF and granular Phase 15 permissions. Checkout review/payment requests now accept optional `valueRedemptions` for loyalty points, store credit and gift cards; final usable amounts are always recalculated by the backend.

## Phase 16 Reporting
Admin: `GET /api/v1/admin/reports/stores`, `GET /api/v1/admin/reports/:report`, `GET /api/v1/admin/reports/export`.

## Phase 17 Staff and Access Management

Admin staff APIs:

```text
GET   /api/v1/admin/staff/users
GET   /api/v1/admin/staff/users/:id
POST  /api/v1/admin/staff/users
PATCH /api/v1/admin/staff/users/:id
POST  /api/v1/admin/staff/users/:id/reset-password
POST  /api/v1/admin/staff/users/:id/logout-all

GET   /api/v1/admin/staff/roles
POST  /api/v1/admin/staff/roles
PATCH /api/v1/admin/staff/roles/:id

GET   /api/v1/admin/staff/permissions
GET   /api/v1/admin/staff/audit-logs
```

Public one-time password setup:

```text
POST /api/v1/auth/admin/setup-password
```

Staff mutations require Admin CSRF and backend RBAC. Password setup tokens are single-use, expire after 24 hours, and are stored only as SHA-256 hashes.
