# Architecture — Phase 1

The platform uses three independently deployable applications: `grocery-storefront`, `grocery-admin`, and `grocery-server`.
All business logic and persistence access are owned by `grocery-server`. Storefront and admin communicate only by HTTPS REST API.

Phase 1 creates the MongoDB/authentication/RBAC/audit foundation only. Catalog, inventory, Stripe, orders, fulfillment, and reporting are intentionally not implemented yet.

# Phase 3 Inventory Boundary

Phase 3 introduces a backend-owned inventory subsystem. Frontends may request inventory operations through authorized APIs, but only the backend mutates stock balances. The inventory service is designed for reuse by future checkout, order, picker, POS, and warehouse modules.

Critical multi-document movements use MongoDB transactions. Reservation ownership is validated from the immutable ledger by reference type/reference ID before a release or commit can reduce another workflow's reserved quantity.

## Phase 5 Public Catalog Boundary

The customer Storefront consumes a read-only public catalog API. The API combines Product, Brand, Category, Collection, StoreLocation, StoreProduct and Inventory data while keeping MongoDB access and availability logic server-side. The selected store affects product enablement and availability but does not create reservations.
