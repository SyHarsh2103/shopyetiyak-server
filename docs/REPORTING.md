# Phase 16 Advanced Reporting

Phase 16 adds read-only Admin reporting under `/api/v1/admin/reports` for sales, revenue, profitability, inventory, waste/expiry, customers, suppliers, payments/refunds, and fulfillment.

## Permissions
- `reports.read`
- `reports.export`

## Date rules
Report date ranges are inclusive and limited to 366 days. Dates use `YYYY-MM-DD` and backend UTC boundaries. Store and currency filters are optional.

## Profitability cost basis
New orders store `items.costPriceMinorSnapshot` at order creation. Older orders created before Phase 16 do not contain historical cost snapshots, so profitability reporting uses the current product variant cost as an explicit fallback. The response includes snapshot/fallback counts and coverage.

## Exports
`GET /api/v1/admin/reports/export?report=sales&format=csv|excel|pdf&from=YYYY-MM-DD&to=YYYY-MM-DD`

Excel export uses Excel-readable SpreadsheetML (`.xls`) so no additional runtime package is required. PDF export is generated server-side without exposing database access to the Admin client.
