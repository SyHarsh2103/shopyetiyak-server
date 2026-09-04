# Purchasing Architecture

Phase 4 implements the supplier-to-inventory procurement workflow.

## Collections

- `suppliers`
- `supplierProducts`
- `purchaseOrders`
- `goodsReceipts`
- `supplierReturns`

## Purchase order lifecycle

```text
DRAFT -> APPROVED -> SENT -> PARTIALLY_RECEIVED -> RECEIVED -> CLOSED
   \-> CANCELLED
APPROVED -> CANCELLED
SENT -> CANCELLED only before any stock is received
PARTIALLY_RECEIVED -> CLOSED when the business intentionally closes a short shipment
```

Receiving state is calculated from accepted quantity. Damaged units are recorded on the goods receipt but do not increase inventory and do not count toward PO fulfillment, allowing replacement units to be received later.

## Atomic goods receiving

One MongoDB transaction performs:

```text
Validate PO and remaining line quantity
+ Create / merge inventory batch
+ Increase inventory on-hand and available
+ Write PURCHASE_RECEIPT inventory ledger row
+ Update PO received quantity and status
+ Create goods receipt
+ Update supplier-product last received cost
```

No nested inventory transaction is started. Purchasing calls the Phase 3 session-aware inventory primitive so all participating writes use one session.

## Cost tracking

Money values use integer minor units. Cost history is retained in:

- Purchase order line snapshots
- Goods receipt actual unit costs
- Inventory batch weighted cost
- Supplier-product `lastReceivedCostMinor`
- Supplier return value snapshots

Inventory batches also retain a three-letter cost currency. Existing Phase 3 manual receipts default to `USD` for backward compatibility.

## Supplier returns

Supplier returns require an existing supplier-linked inventory batch. The transaction:

```text
Validate supplier/store/batch
+ Validate available stock
+ Decrease on-hand and available
+ Decrease batch remaining quantity
+ Write SUPPLIER_RETURN ledger row
+ Create supplier return record
```

Reserved stock cannot be returned to a supplier.
