# Recipes and Meal Kits — Phase 13

## Principles

Recipes are content records with optional product mappings. A recipe ingredient can be informational only or map to one concrete product variant with a cart quantity.

Meal kits reuse the Phase 12 bundle architecture and use `bundleType: MEAL_KIT`. No synthetic meal-kit inventory is maintained.

## Customer flow

```text
Recipe detail
  ↓
Select mapped ingredients
  ↓
POST /recipes/:slug/cart
  ↓
Backend expands product/variant lines
  ↓
Existing cart validation
  ↓
Current store availability and inventory checked
```

Meal-kit flow:

```text
MEAL_KIT bundle
  ↓
POST /meal-kits/:slug/cart
  ↓
Bundle components expanded
  ↓
Existing cart / promotion / checkout / inventory workflow
```

## Security and integrity

- Product and variant mappings are validated when recipe content is saved.
- Meal-kit links must point to active `MEAL_KIT` bundles.
- Cart mutations require CSRF and use the established guest/customer owner model.
- Prices, discounts and inventory are never stored as authoritative recipe data.
- Admin recipe changes are RBAC-protected and audit logged.
