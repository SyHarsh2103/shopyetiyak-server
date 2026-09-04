# Changelog

## 0.2.0 — Phase 2 implementation prepared
- Added nested categories, brands and flexible collections.
- Added grocery/retail product schema with mandatory variants.
- Added SKU, barcode, UPC and EAN validation/indexing.
- Added dietary, nutrition, allergen, origin, storage, SEO and tag metadata.
- Added smallest-unit price storage.
- Added local `StorageProvider` abstraction and secure product-image upload.
- Added catalog RBAC permissions and audit events.
- Added idempotent initial catalog seed.
- Added Admin Catalog UI and Phase 2 tests.

## 0.1.0 — Phase 1
- Added Express/TypeScript foundation, MongoDB auth/session/RBAC/audit models, secure customer/admin authentication, tests and documentation.

## Phase 3 — Stores and Inventory
- Added store locations and store-specific product availability.
- Added inventory balances with on-hand, reserved, available, and reorder policies.
- Added transaction-safe reservation, release, and commit services.
- Added inventory batch receipt, expiry monitoring, and FEFO depletion.
- Added traceable manual adjustments, waste/shrinkage reasons, and store transfers.
- Added immutable inventory transaction ledger.
- Added Phase 3 RBAC permissions and MongoDB indexes.
- Added inventory validation and concurrency/FEFO service tests.

## 0.4.0 — Phase 4 Suppliers and Purchasing
- Added suppliers and supplier-product sourcing/cost mappings.
- Added purchase orders with controlled lifecycle transitions.
- Added partial goods receiving integrated atomically with Phase 3 inventory and batches.
- Added damaged receiving quantity tracking.
- Added supplier returns with inventory ledger integration.
- Added purchasing RBAC permissions, indexes, tests, Admin clients, and documentation.
- Added batch cost currency and weighted cost merging for repeat PO batch receipts.

## 0.5.0 — Phase 5 Storefront Catalog

- Added public catalog REST API.
- Added active store/category/collection/brand discovery.
- Added store-aware product availability.
- Added storefront search, filters, supported sorting and autocomplete.
- Added product detail enrichment and related-product responses.

## 0.6.0 — Phase 6 Customer Account

- Added customer profile and address management.
- Added wishlists and named grocery lists.
- Added protected customer account API namespace.
- Added current-price/current-inventory enrichment for saved products.
- Added reorder validation architecture without creating Phase 9 order records early.
- Added Phase 6 tests and indexes.


## 0.7.0 — Phase 7

- Added persistent guest/customer carts and save-for-later state.
- Added backend-authoritative current price, quantity, and inventory validation.
- Added coupon validation foundation and bulk cart insertion.
- Added guest/customer checkout review, fulfillment selection, and tax-service abstraction.
- Added explicit Phase 8 payment and Phase 11 delivery-slot boundaries.

## 0.8.0 — Phase 8 Stripe Payments

- Added Stripe PaymentIntent service and test-mode configuration.
- Added Payment, PaymentAttempt, Refund and StripeWebhookEvent MongoDB models/indexes.
- Added application and Stripe idempotency handling.
- Added automatic capture for standard carts and manual authorization/capture for variable-weight carts.
- Added verified raw-body Stripe webhook endpoint with event deduplication.
- Added customer/guest payment-status lookup.
- Added permission-guarded Admin capture, cancel and refund APIs with audit logging.
- Added Stripe Payment Element integration to the Storefront checkout.
- Preserved the Phase 9 boundary: no persistent Order is created in Phase 8.

## 0.9.0 — Phase 9 Orders
- Added persistent `orders` and `orderStatusHistories` collections.
- Added transactional order creation with inventory reservation and Payment linkage.
- Added immutable order item, contact, store, pricing, coupon and tax snapshots.
- Added customer order history/detail/reorder/cancellation APIs.
- Added admin order list/detail/status/cancellation/refund APIs and RBAC permissions.
- Connected validated Phase 8 payment/webhook state to order payment/order status.
- Added cancellation/refund inventory release while preserving Phase 10 inventory commit boundary.

## 0.10.0 — Phase 10 Grocery Fulfillment
- Added picker queue/workspace APIs with actual variable-weight entry and per-line resolution state.
- Added customer substitution preferences and persistent `orderSubstitutions` records.
- Added unavailable-item handling with immediate reservation release.
- Added replacement inventory reservation, current-price/current-tax validation and substitution constraints.
- Added selected-batch validation plus FEFO fulfillment batch recommendations.
- Added packing workflow with bag count and notes.
- Added final fulfillment pricing separate from the immutable checkout pricing snapshot.
- Added Stripe manual capture / automatic over-capture refund settlement before inventory commit.
- Added transactional `ORDER_COMMIT` at packing completion and Ready / Ready-for-Pickup transitions.
- Added fulfillment RBAC permissions, Admin UI/API integration and Phase 10 tests.


## 0.11.0 — Phase 11 Delivery and Pickup
- Added store-specific delivery zones with normalized ZIP eligibility, minimum order, fee and free-delivery threshold rules.
- Added delivery-radius configuration architecture and weekday availability.
- Added timezone-safe delivery and pickup slots with cutoffs, capacity and booked counts.
- Added transactional slot reservation/release integrated with order creation, payment-failure retry and cancellation.
- Added immutable delivery-zone/slot snapshots to Orders.
- Added Storefront slot selection and authoritative checkout fee calculation.
- Added Admin zone/slot management and Delivery/Pickup operational queues.
- Added `READY → OUT_FOR_DELIVERY → DELIVERED` and `READY_FOR_PICKUP → PICKED_UP` transitions.
- Added Delivery/Pickup RBAC, audit integration, indexes and Phase 11 tests.

## 0.12.0 — Phase 12 Promotions and Merchandising
- Added automatic cart/product/category/brand/collection promotions and free-delivery campaigns.
- Expanded coupons with targeting, dates, minimum spend, maximum discount, usage limits and stacking policy.
- Added coupon redemption records tied to Orders.
- Added scheduled banners and storefront campaign rendering.
- Added product bundles mapped to real inventory components, including fixed bundle-price discounts.
- Added scheduled Weekly Deal/Festival collection metadata.
- Added calculated Best Sellers, New Arrivals and Featured Products merchandising.
- Added Marketing RBAC, audit logging, Admin workspaces, indexes and Phase 12 tests.

## 0.13.0 — Phase 13 Recipes and Meal Kits

- Added recipe management and public recipe catalog/detail APIs.
- Added ingredient-to-product/variant mappings and selective Add Ingredients to Cart.
- Added `MEAL_KIT` bundle classification and standalone meal-kit storefront/cart workflow.
- Meal kits continue using real component inventory rather than synthetic stock.
- Added `content.read` / `content.manage` RBAC and recipe audit events.
- Added storefront Recipes and Meal Kits pages plus homepage/navigation integration.

## 0.14.0 — Phase 14 Bulk, Wedding and Party Orders
- Added inquiry and lead-management workflow for bulk, wedding and party requests.
- Added negotiated quotation records with product/custom lines, discounts, tax, delivery and deposit terms.
- Added private quote acceptance links and Stripe deposit PaymentIntents.
- Added quote deposit webhook handling and idempotency.
- Added quote-to-order conversion with transactional inventory and slot reservation.
- Added quote-sourced order snapshots and prepaid-deposit accounting.
- Added Phase 14 RBAC, audit logging, indexes, Admin/Storefront UIs and tests.

## 0.15.0 — Phase 15 Customer Value Systems

- Added loyalty accounts and append-only points ledger with earn, redeem, adjustment, refund reversal and redemption restoration.
- Added currency-aware customer store-credit accounts and transaction ledger.
- Added secure hash-only gift-card codes, balances, lifecycle controls and transaction ledger.
- Added backend-authoritative checkout redemption across loyalty, store credit and gift cards.
- Added internal zero-balance payment handling when customer value fully covers an order.
- Added transactional order redemption debit/restoration and fulfillment-time prepaid-value reconciliation.
- Added idempotent loyalty earning after successful payment while excluding merchandise value paid with loyalty points.
- Added back-in-stock subscriptions plus Admin/CLI SMTP dispatch against authoritative inventory availability.
- Added Customer Rewards UI, checkout controls, product alert signup, Admin customer-value workspaces, RBAC, indexes and Phase 15 tests.

## 0.16.0
- Added advanced reporting, profitability/cost snapshots, and CSV/Excel/PDF exports.
