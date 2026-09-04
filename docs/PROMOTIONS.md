# Promotions and Merchandising — Phase 12

Phase 12 adds backend-authoritative promotions and merchandising.

## Collections
- `promotions`: automatic cart/product/category/brand/collection discounts and free-delivery rules.
- `coupons`: customer-entered codes with minimum spend, targeting, store restrictions, dates and usage limits.
- `couponRedemptions`: immutable order-linked coupon usage records; cancelled orders release their redemption.
- `banners`: scheduled storefront campaign banners.
- `bundles`: real product/variant component mappings. Bundle stock is never duplicated.

## Automatic promotions
Supported types: `PERCENTAGE`, `FIXED`, `FREE_DELIVERY`.
Supported scopes: `CART`, `PRODUCT`, `CATEGORY`, `BRAND`, `COLLECTION`.
Promotion evaluation occurs in the cart service before checkout tax/payment totals are finalized.

## Coupons
Coupon rules support percentage/fixed discounts, minimum subtotal, maximum discount, global/per-customer usage limits, store/product/category/brand/collection restrictions, campaign dates, and promotion stacking rules.

## Bundle pricing
A fixed-price bundle is recognized when the cart contains the required real component variants in sufficient quantities. The bundle price difference is applied as a cart discount; inventory continues to reserve/commit the component products.

## Merchandising
- Featured products use the existing product `isFeatured` flag.
- New Arrivals use product creation time.
- Best Sellers are derived from fulfilled order-item history.
- Weekly Deal and Festival collections support `startsAt`/`endsAt` and automatically disappear when inactive.

## Security
All Admin mutations require admin authentication, CSRF protection and `marketing.manage`; reads require `marketing.read`. Admin writes are audit logged.
