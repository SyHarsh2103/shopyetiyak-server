# Security — Phase 2

Phase 1 authentication, CSRF, CORS, secure-cookie, rate-limit and RBAC controls remain required.

Phase 2 additions:
- Catalog reads require `catalog.read`.
- Every catalog mutation requires a granular permission and Admin CSRF protection.
- Product identifiers are validated server-side and checked for conflicts.
- Referenced MongoDB IDs are validated before product persistence.
- Product uploads use Multer 2.2.0 and memory buffering with one-file/5-MB limits.
- Only JPEG, PNG, WebP and AVIF MIME types are accepted.
- Local files receive generated UUID filenames; user filenames never determine storage paths.
- Storage keys are normalized and traversal attempts are rejected.
- Product images are served from the configured persistent `UPLOAD_PATH`.
- Audit records are written for catalog creates, updates, deletions/archives and image operations.
- Product deletion is archival to preserve commerce-history compatibility.

## Phase 8 Stripe security

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are backend-only.
- Local/development Stripe requests require an `sk_test_` key.
- PaymentIntent amount/currency are derived from a fresh backend checkout review.
- PaymentIntent initialization is rate-limited before provider creation.
- Browser-submitted payment totals are never trusted.
- Stripe client secrets are returned only to the checkout client and are not persisted in MongoDB.
- Webhooks use the raw request body and Stripe signature verification before processing.
- Stripe event IDs are uniquely persisted to prevent duplicate webhook processing.
- Payment mutations use hashed application idempotency keys plus Stripe idempotency keys.
- Capture/cancel/refund operations are Admin-authenticated, CSRF-protected, permission-checked and audit logged.
- Variable-weight carts use manual capture so future fulfillment can calculate eligible final amounts before capture.
- Payment and order status remain separate; validated Phase 8 Stripe events synchronize only payment-related fields/states on the Phase 9 persistent order.

## Phase 10 fulfillment security

- Picker and packer endpoints require Admin authentication, granular RBAC and CSRF on every mutation.
- `PICKER` and `PACKER` receive only their fulfillment-specific read/manage permissions by default; broader operational roles receive both without replacing custom role grants.
- Actual weight, picked quantity, replacement choice and bag count are validated with Zod at the API boundary.
- Replacement pricing, tax, inventory and store availability are recalculated server-side; picker-submitted prices are never accepted.
- `CONTACT_FIRST` substitutions require an explicit recorded customer-approval flag, and `DO_NOT_SUBSTITUTE` lines cannot be replaced.
- Fulfillment totals cannot exceed the existing Stripe authorization/capture ceiling.
- Inventory release/reservation/commit operations use MongoDB transactions and the inventory ledger.
- Expired batches cannot be selected or committed for customer fulfillment.
- Packed orders with committed inventory are blocked from the normal cancellation path.


## Phase 11 Delivery and Pickup Security

- The browser cannot authoritatively choose delivery fees, minimums, or capacity. Checkout recomputes delivery rules on the backend.
- Order creation atomically reserves the selected slot using a capacity predicate, preventing normal concurrent overbooking.
- Delivery/pickup Admin mutations require authentication, granular RBAC and Admin CSRF protection.
- Delivery/pickup status mutations are audit logged.
- Slot date/time is converted using the store timezone; cutoff comparisons use absolute timestamps.
- Historical Order snapshots are retained even if an Admin later edits zone/slot configuration.

## Phase 14 quote security

- Public quote URLs use high-entropy opaque tokens; only SHA-256 hashes are persisted.
- Quote admin writes require authentication, CSRF, RBAC and audit logging.
- Stripe deposit events use the existing verified/deduplicated webhook entry point.
- SMTP failure does not persist a false `SENT` quote state.
- Paid-deposit quotes cannot be cancelled without a separate refund decision.
- Quote conversion revalidates inventory and fulfillment capacity server-side.

## Staff account security

Normal staff identities are created through the protected Admin Staff API rather than through `.env`. New accounts receive a one-time password setup URL. The raw setup token is never persisted; only its SHA-256 hash is stored, and the token record has a TTL expiry index.

The server prevents removal of the last active `SUPER_ADMIN`, prevents non-super administrators from assigning `SUPER_ADMIN`, and prevents delegated administrators from granting roles/permissions beyond their own effective access. Disabling an account or issuing an administrator-driven password reset revokes active sessions. Staff and RBAC changes are written to the audit log.
