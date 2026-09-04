# Inventory Architecture

## Phase 3 scope

Inventory is owned by the backend and is keyed by the unique logical combination:

```text
storeId + productId + variantId
```

The inventory balance stores:

```text
quantityOnHand
quantityReserved
quantityAvailable
reorderLevel
reorderQuantity
```

Invariant:

```text
quantityAvailable = quantityOnHand - quantityReserved
```

## Reservation lifecycle

Reservation:

```text
onHand unchanged
reserved + quantity
available - quantity
```

Commit:

```text
onHand - quantity
reserved - quantity
available unchanged
```

Release:

```text
onHand unchanged
reserved - quantity
available + quantity
```

Reservation updates use an atomic `quantityAvailable >= requestedQuantity` filter. The balance update and inventory transaction ledger entry are executed in the same MongoDB transaction.

## Inventory transaction ledger

Every stock movement creates an immutable `inventoryTransactions` record containing balance-before, deltas, balance-after, actor, references, notes, and batch allocations where applicable.

Supported transaction types:

- PURCHASE_RECEIPT
- ORDER_RESERVATION
- ORDER_COMMIT
- ORDER_RELEASE
- RETURN
- TRANSFER_IN
- TRANSFER_OUT
- DAMAGED
- EXPIRED
- SPOILED
- LOST
- THEFT
- MANUAL_ADJUSTMENT
- SUPPLIER_RETURN
- CUSTOMER_RETURN
- INTERNAL_USE
- SAMPLE

## Batches and FEFO

Perishable stock can be received into `inventoryBatches` with batch number, received/manufacturing/expiry dates, quantity, supplier snapshot, and unit cost.

Physical depletion on commit, negative adjustment, and store transfer consumes tracked batches using First Expired, First Out (FEFO). Batches without an expiry date are consumed after dated batches.

Admin expiry filters support:

- Expired
- Expiring within 7 days
- Expiring within 15 days
- Expiring within 30 days

## Transfers

Store transfers execute atomically. Source inventory decreases, target inventory increases, transferable tracked batch quantities are copied to the target store, and paired TRANSFER_OUT / TRANSFER_IN ledger rows share one transfer ID.

## Phase 4 integration

Phase 3 includes a manual batch-receipt endpoint so inventory can be tested now. Phase 4 supplier purchasing and goods receiving should call the same receipt service instead of implementing a second stock-increase path.

## Phase 4 Purchasing Integration

Goods receiving uses the same inventory balance and transaction ledger introduced in Phase 3. Accepted PO quantities create `PURCHASE_RECEIPT` movements and supplier returns create `SUPPLIER_RETURN` movements. Purchasing and inventory writes are committed in the same MongoDB transaction.

Inventory batches now include `currency` with a backward-compatible `USD` default. Repeated batch numbers may be merged during PO receiving only when supplier and currency remain consistent.

## Phase 10 Fulfillment Commit

Order placement reserves stock in Phase 9. Phase 10 resolves each reservation during picking and packing:

- picked quantity below the original reservation releases the excess;
- a supported variable-weight increase reserves only the additional quantity and fails safely if unavailable;
- unavailable items release their reservation immediately;
- substitutions release the original reservation and reserve the replacement variant;
- packing completion commits only resolved picked/replacement inventory using `ORDER_COMMIT`;
- selected batches are honored when valid; otherwise batch depletion uses FEFO;
- expired batches are excluded from customer-fulfillment commit;
- packed/committed orders cannot use the ordinary cancellation path because stock has already left available inventory.

Packing and inventory commit execute in one MongoDB transaction after final payment settlement has been verified.
