# Bulk, Wedding, Party Orders and Quotes

Phase 14 adds a separate negotiated-order workflow without bypassing normal commerce controls.

## Domain flow

```text
Customer inquiry
  -> Admin lead management
  -> Draft quotation
  -> Private tokenized quote link
  -> Customer acceptance
  -> Optional Stripe deposit
  -> Admin conversion
  -> Inventory + fulfillment-slot reservation
  -> Normal grocery order
  -> Remaining Stripe order payment
```

## Collections

- `bulkOrderRequests`: inquiry/contact/event requirements and lead lifecycle.
- `quotes`: negotiated line snapshots, totals, deposit terms, acceptance and conversion state.
- `quoteDepositPayments`: Stripe PaymentIntent records for quote deposits.

Quote product lines snapshot product/variant/SKU metadata and negotiated unit prices. Custom quote lines are financial/service lines only and never create fake inventory SKUs.

## Quote security

Customer quote access uses an opaque token. Only a SHA-256 hash and the final four characters are stored. The raw token is delivered in the private quote link and is required for public quote reads and payment actions.

Admin quote mutations require admin authentication, CSRF validation, granular RBAC and audit logging.

## Deposit safety

Quote deposits use independent Stripe PaymentIntents and are not stored as normal order payments. Stripe webhook events remain signature-verified and deduplicated. A paid deposit is copied into the converted order as `prepaidAmountMinor`, and the normal order payment contains only the remaining balance.

A quote with a paid deposit cannot be cancelled through the normal cancellation action because a financial refund decision is required first.

## Quote-to-order conversion

Conversion revalidates:

- active store
- real product and variant inventory through the existing reservation service
- delivery ZIP/zone and delivery slot, or pickup slot
- slot capacity inside the MongoDB transaction
- quote acceptance and required deposit status

The normal order uses `source: QUOTE`, stores a quote snapshot, and then continues through existing picking, packing, delivery/pickup, inventory commit, and order-payment workflows.
