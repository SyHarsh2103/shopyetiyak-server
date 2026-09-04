import { Types } from "mongoose";

import { InventoryModel } from "../inventory/inventory.model.js";
import { ProductModel } from "../products/product.model.js";
import {
  quoteAutomaticPromotions,
  quoteCoupon,
} from "../promotions/promotion-engine.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { sha256 } from "../../utils/crypto.js";
import { CartModel } from "./cart.model.js";

const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QUANTITY_EPSILON = 1e-9;

export interface CartOwner {
  customerId?: string;
  guestToken?: string;
}

export interface CartMutationItem {
  storeId: string;
  productId: string;
  variantId: string;
  quantity: number;
}

interface CartItemReference {
  productId: string;
  variantId: string;
  quantity: number;
  savedForLater: boolean;
  addedAt: Date;
}

export interface CouponQuote {
  code: string;
  valid: boolean;
  discountMinor: number;
  message: string;
}

function guestExpiresAt(): Date {
  return new Date(
    Date.now() + GUEST_CART_TTL_MS,
  );
}

function currentPriceMinor(
  variant: {
    pricing: {
      regularPriceMinor: number;
      salePriceMinor?: number | null;
    };
  },
): number {
  const sale =
    variant.pricing.salePriceMinor ??
    null;

  return (
    sale !== null &&
    sale <
      variant.pricing
        .regularPriceMinor
  )
    ? sale
    : variant.pricing
        .regularPriceMinor;
}

function quantityMatchesIncrement(
  quantity: number,
  minimum: number,
  increment: number,
): boolean {
  const steps =
    (quantity - minimum) /
    increment;

  return (
    Math.abs(
      steps -
        Math.round(steps),
    ) <= QUANTITY_EPSILON
  );
}

async function requireActiveStore(
  storeId: string,
) {
  const store =
    await StoreLocationModel.findOne({
      _id:
        storeId,
      status:
        "ACTIVE",
    }).lean();

  if (!store) {
    throw new ApiError(
      404,
      "STORE_NOT_FOUND",
      "The selected store is not available.",
    );
  }

  return store;
}

async function findGuestCart(
  storeId: string,
  guestToken?: string,
) {
  if (!guestToken) {
    return null;
  }

  return CartModel.findOne({
    storeId:
      new Types.ObjectId(
        storeId,
      ),
    guestTokenHash:
      sha256(
        guestToken,
      ),
  }).select(
    "+guestTokenHash",
  );
}

async function mergeGuestCartIntoCustomer(
  storeId: string,
  customerId: string,
  guestToken?: string,
) {
  const customerCart =
    await CartModel.findOne({
      storeId:
        new Types.ObjectId(
          storeId,
        ),
      customerId:
        new Types.ObjectId(
          customerId,
        ),
    });

  const guestCart =
    await findGuestCart(
      storeId,
      guestToken,
    );

  if (!guestCart) {
    return customerCart;
  }

  if (!customerCart) {
    guestCart.customerId =
      new Types.ObjectId(
        customerId,
      );

    guestCart.guestTokenHash =
      null;

    guestCart.expiresAt =
      null;

    await guestCart.save();

    return guestCart;
  }

  const merged =
    new Map<
      string,
      CartItemReference
    >();

  for (
    const item of
      customerCart.items
  ) {
    merged.set(
      `${item.productId.toString()}:${item.variantId.toString()}`,
      {
        productId:
          item.productId.toString(),

        variantId:
          item.variantId.toString(),

        quantity:
          item.quantity,

        savedForLater:
          item.savedForLater,

        addedAt:
          item.addedAt,
      },
    );
  }

  for (
    const item of
      guestCart.items
  ) {
    const key =
      `${item.productId.toString()}:${item.variantId.toString()}`;

    const existing =
      merged.get(key);

    if (!existing) {
      merged.set(
        key,
        {
          productId:
            item.productId.toString(),

          variantId:
            item.variantId.toString(),

          quantity:
            item.quantity,

          savedForLater:
            item.savedForLater,

          addedAt:
            item.addedAt,
        },
      );

      continue;
    }

    existing.quantity =
      Math.max(
        existing.quantity,
        item.quantity,
      );

    existing.savedForLater =
      existing.savedForLater &&
      item.savedForLater;

    existing.addedAt =
      existing.addedAt <=
      item.addedAt
        ? existing.addedAt
        : item.addedAt;
  }

  if (
    merged.size >
    200
  ) {
    throw new ApiError(
      409,
      "CART_ITEM_LIMIT_REACHED",
      "The merged cart would exceed the 200-item limit.",
    );
  }

  customerCart.set(
    "items",
    [
      ...merged.values(),
    ].map(
      (item) => ({
        productId:
          new Types.ObjectId(
            item.productId,
          ),

        variantId:
          new Types.ObjectId(
            item.variantId,
          ),

        quantity:
          item.quantity,

        savedForLater:
          item.savedForLater,

        addedAt:
          item.addedAt,
      }),
    ),
  );

  customerCart.couponCode ||=
    guestCart.couponCode;

  await customerCart.save();

  await CartModel.deleteOne({
    _id:
      guestCart._id,
  });

  return customerCart;
}

async function findCart(
  owner: CartOwner,
  storeId: string,
  create: boolean,
) {
  await requireActiveStore(
    storeId,
  );

  if (
    owner.customerId
  ) {
    const merged =
      await mergeGuestCartIntoCustomer(
        storeId,
        owner.customerId,
        owner.guestToken,
      );

    if (
      merged ||
      !create
    ) {
      return merged;
    }

    return CartModel.create({
      customerId:
        new Types.ObjectId(
          owner.customerId,
        ),

      guestTokenHash:
        null,

      storeId:
        new Types.ObjectId(
          storeId,
        ),

      items:
        [],

      expiresAt:
        null,
    });
  }

  if (
    !owner.guestToken
  ) {
    throw new ApiError(
      400,
      "GUEST_CART_TOKEN_REQUIRED",
      "A guest cart token is required.",
    );
  }

  const existing =
    await findGuestCart(
      storeId,
      owner.guestToken,
    );

  if (
    existing ||
    !create
  ) {
    return existing;
  }

  return CartModel.create({
    customerId:
      null,

    guestTokenHash:
      sha256(
        owner.guestToken,
      ),

    storeId:
      new Types.ObjectId(
        storeId,
      ),

    items:
      [],

    expiresAt:
      guestExpiresAt(),
  });
}

async function assertVariantForCart(
  storeId: string,
  productId: string,
  variantId: string,
  quantity: number,
): Promise<void> {
  const [
    product,
    inventory,
    storeProduct,
  ] = await Promise.all([
    ProductModel.findOne({
      _id:
        productId,

      isActive:
        true,

      archivedAt:
        null,

      variants: {
        $elemMatch: {
          _id:
            variantId,

          status:
            "ACTIVE",
        },
      },
    }).lean(),

    InventoryModel.findOne({
      storeId,
      productId,
      variantId,
    }).lean(),

    StoreProductModel.findOne({
      storeId,
      productId,
    }).lean(),
  ]);

  const variant =
    product?.variants.find(
      (item) =>
        item._id.toString() ===
        variantId,
    );

  if (
    !product ||
    !variant
  ) {
    throw new ApiError(
      404,
      "PRODUCT_VARIANT_NOT_AVAILABLE",
      "This product option is no longer available.",
    );
  }

  if (
    storeProduct &&
    !storeProduct.isAvailable
  ) {
    throw new ApiError(
      409,
      "STORE_PRODUCT_UNAVAILABLE",
      "This product is unavailable at the selected store.",
    );
  }

  const minimumQuantity =
    variant.minimumQuantity ??
    1;

  const maximumQuantity =
    variant.maximumQuantity ??
    null;

  const quantityIncrement =
    variant.quantityIncrement ??
    1;

  if (
    quantity <
    minimumQuantity
  ) {
    throw new ApiError(
      400,
      "QUANTITY_BELOW_MINIMUM",
      `Minimum quantity is ${minimumQuantity}.`,
    );
  }

  if (
    maximumQuantity !==
      null &&
    quantity >
      maximumQuantity
  ) {
    throw new ApiError(
      400,
      "QUANTITY_ABOVE_MAXIMUM",
      `Maximum quantity is ${maximumQuantity}.`,
    );
  }

  if (
    !quantityMatchesIncrement(
      quantity,
      minimumQuantity,
      quantityIncrement,
    )
  ) {
    throw new ApiError(
      400,
      "INVALID_QUANTITY_INCREMENT",
      `Quantity must increase in increments of ${quantityIncrement} starting at ${minimumQuantity}.`,
    );
  }

  const available =
    inventory
      ?.quantityAvailable ??
    0;

  if (
    quantity >
    available
  ) {
    throw new ApiError(
      409,
      "PRODUCT_OUT_OF_STOCK",
      `Only ${available} is currently available at this store.`,
    );
  }
}

export async function getCartQuote(
  owner: CartOwner,
  storeId: string,
) {
  const store =
    await requireActiveStore(
      storeId,
    );

  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  const references =
    (
      cart?.items ??
      []
    ).map(
      (item) => ({
        productId:
          item.productId.toString(),

        variantId:
          item.variantId.toString(),

        quantity:
          item.quantity,

        savedForLater:
          item.savedForLater,

        addedAt:
          item.addedAt,
      }),
    );

  if (
    references.length ===
    0
  ) {
    return {
      id:
        cart?._id.toString() ??
        null,

      owner:
        owner.customerId
          ? "CUSTOMER"
          : "GUEST",

      store: {
        id:
          store._id.toString(),

        name:
          store.name,

        code:
          store.code,

        pickupEnabled:
          store.pickupEnabled,

        deliveryEnabled:
          store.deliveryEnabled,
      },

      items:
        [],

      savedForLaterItems:
        [],

      coupon: {
        code:
          cart?.couponCode ??
          "",

        valid:
          false,

        discountMinor:
          0,

        message:
          "",
      },

      promotions: {
        automaticDiscountMinor:
          0,

        freeDelivery:
          false,

        applied:
          [],
      },

      totals: {
        currency:
          "USD",

        itemCount:
          0,

        subtotalMinor:
          0,

        discountMinor:
          0,

        estimatedTotalMinor:
          0,
      },

      canCheckout:
        false,

      issues: [
        "Cart is empty.",
      ],
    };
  }

  const productIds = [
    ...new Set(
      references.map(
        (item) =>
          item.productId,
      ),
    ),
  ].map(
    (id) =>
      new Types.ObjectId(
        id,
      ),
  );

  const inventoryOr =
    references.map(
      (item) => ({
        productId:
          new Types.ObjectId(
            item.productId,
          ),

        variantId:
          new Types.ObjectId(
            item.variantId,
          ),
      }),
    );

  const [
    products,
    inventories,
    storeProducts,
  ] = await Promise.all([
    ProductModel.find({
      _id: {
        $in:
          productIds,
      },
    }).lean(),

    InventoryModel.find({
      storeId:
        store._id,

      $or:
        inventoryOr,
    }).lean(),

    StoreProductModel.find({
      storeId:
        store._id,

      productId: {
        $in:
          productIds,
      },
    }).lean(),
  ]);

  const productMap =
    new Map(
      products.map(
        (product) => [
          product._id.toString(),
          product,
        ],
      ),
    );

  const inventoryMap =
    new Map(
      inventories.map(
        (inventory) => [
          `${inventory.productId.toString()}:${inventory.variantId.toString()}`,
          inventory.quantityAvailable,
        ],
      ),
    );

  const storeProductMap =
    new Map(
      storeProducts.map(
        (record) => [
          record.productId.toString(),
          record,
        ],
      ),
    );

  const enriched =
    references.map(
      (reference) => {
        const product =
          productMap.get(
            reference.productId,
          );

        const variant =
          product?.variants.find(
            (entry) =>
              entry._id.toString() ===
              reference.variantId,
          );

        const storeProduct =
          storeProductMap.get(
            reference.productId,
          );

        const productActive =
          Boolean(
            product &&
              product.isActive &&
              product.archivedAt ===
                null &&
              variant?.status ===
                "ACTIVE",
          );

        const storeEnabled =
          !storeProduct ||
          storeProduct.isAvailable;

        const quantityAvailable =
          inventoryMap.get(
            `${reference.productId}:${reference.variantId}`,
          ) ?? 0;

        const currentMinor =
          variant
            ? currentPriceMinor(
                variant,
              )
            : 0;

        const maximum =
          variant
            ?.maximumQuantity ??
          null;

        const minimum =
          variant
            ?.minimumQuantity ??
          1;

        const increment =
          variant
            ?.quantityIncrement ??
          1;

        const quantityValid =
          Boolean(
            variant &&
              reference.quantity >=
                minimum &&
              (
                maximum ===
                  null ||
                reference.quantity <=
                  maximum
              ) &&
              quantityMatchesIncrement(
                reference.quantity,
                minimum,
                increment,
              ),
          );

        const inStock =
          productActive &&
          storeEnabled &&
          quantityValid &&
          reference.quantity <=
            quantityAvailable;

        const primaryImage =
          product?.images.find(
            (image) =>
              image.isPrimary,
          ) ??
          product?.images[0] ??
          null;

        const issues:
          string[] =
          [];

        if (
          !productActive
        ) {
          issues.push(
            "Product or variant is no longer active.",
          );
        }

        if (
          !storeEnabled
        ) {
          issues.push(
            "Product is disabled for this store.",
          );
        }

        if (
          !quantityValid
        ) {
          issues.push(
            "Selected quantity is not valid for this product option.",
          );
        }

        if (
          productActive &&
          storeEnabled &&
          reference.quantity >
            quantityAvailable
        ) {
          issues.push(
            `Only ${quantityAvailable} is currently available.`,
          );
        }

        return {
          productId:
            reference.productId,

          variantId:
            reference.variantId,

          quantity:
            reference.quantity,

          savedForLater:
            reference.savedForLater,

          addedAt:
            reference.addedAt.toISOString(),

          product:
            product &&
            variant
              ? {
                  name:
                    product.name,

                  slug:
                    product.slug,

                  shortDescription:
                    product.shortDescription,

                  productType:
                    product.productType,

                  taxClassification:
                    product.taxClassification,

                  brandId:
                    product.brandId
                      ?.toString() ??
                    null,

                  categoryIds:
                    product.categoryIds.map(
                      (id) =>
                        id.toString(),
                    ),

                  collectionIds:
                    product.collectionIds.map(
                      (id) =>
                        id.toString(),
                    ),

                  primaryImage:
                    primaryImage
                      ? {
                          url:
                            primaryImage.url,

                          altText:
                            primaryImage.altText,
                        }
                      : null,

                  variant: {
                    sku:
                      variant.sku,

                    attributes:
                      variant.attributes,

                    sellingUnit:
                      variant.sellingUnit,

                    unitQuantity:
                      variant.unitQuantity,

                    minimumQuantity:
                      variant.minimumQuantity,

                    maximumQuantity:
                      variant.maximumQuantity,

                    quantityIncrement:
                      variant.quantityIncrement,

                    pricing: {
                      currency:
                        variant.pricing
                          .currency,

                      regularPriceMinor:
                        variant.pricing
                          .regularPriceMinor,

                      salePriceMinor:
                        variant.pricing
                          .salePriceMinor ??
                        null,

                      currentPriceMinor:
                        currentMinor,
                    },
                  },
                }
              : null,

          availability: {
            productActive,
            storeEnabled,

            pickupEnabled:
              storeProduct
                ?.pickupEnabled ??
              true,

            deliveryEnabled:
              storeProduct
                ?.deliveryEnabled ??
              true,

            quantityAvailable,
            quantityValid,
            inStock,
          },

          lineSubtotalMinor:
            product &&
            variant
              ? Math.round(
                  currentMinor *
                    reference.quantity,
                )
              : 0,

          issues,
        };
      },
    );

  const activeItems =
    enriched.filter(
      (item) =>
        !item.savedForLater,
    );

  const savedForLaterItems =
    enriched.filter(
      (item) =>
        item.savedForLater,
    );

  const currencies =
    new Set(
      activeItems.flatMap(
        (item) =>
          item.product
            ? [
                item.product
                  .variant
                  .pricing
                  .currency,
              ]
            : [],
      ),
    );

  const currency =
    [
      ...currencies,
    ][0] ??
    "USD";

  const subtotalMinor =
    activeItems.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.lineSubtotalMinor,
      0,
    );

  const promotionLines =
    activeItems.flatMap(
      (item) =>
        item.product
          ? [
              {
                productId:
                  item.productId,

                variantId:
                  item.variantId,

                quantity:
                  item.quantity,

                subtotalMinor:
                  item.lineSubtotalMinor,

                brandId:
                  item.product.brandId,

                categoryIds:
                  item.product.categoryIds,

                collectionIds:
                  item.product.collectionIds,
              },
            ]
          : [],
    );

  const automaticPromotions =
    await quoteAutomaticPromotions({
      storeId,

      currency,

      subtotalMinor,

      lines:
        promotionLines,
    });

  const coupon =
    await quoteCoupon({
      code:
        cart?.couponCode ??
        "",

      subtotalMinor:
        Math.max(
          0,
          subtotalMinor -
            automaticPromotions
              .discountMinor,
        ),

      currency,

      storeId,

      customerId:
        owner.customerId,

      lines:
        promotionLines,

      promotionsStackable:
        automaticPromotions
          .couponsStackable,

      hasPromotions:
        automaticPromotions
          .promotions.length >
        0,
    });

  const totalDiscountMinor =
    Math.min(
      subtotalMinor,

      automaticPromotions
        .discountMinor +
        (
          coupon.valid
            ? coupon.discountMinor
            : 0
        ),
    );

  const issues:
    string[] =
    [];

  if (
    activeItems.length ===
    0
  ) {
    issues.push(
      "Cart has no active items.",
    );
  }

  if (
    currencies.size >
    1
  ) {
    issues.push(
      "Cart contains multiple currencies.",
    );
  }

  if (
    activeItems.some(
      (item) =>
        item.issues.length >
        0,
    )
  ) {
    issues.push(
      "One or more cart items require attention.",
    );
  }

  if (
    cart?.couponCode &&
    !coupon.valid
  ) {
    issues.push(
      coupon.message ||
        "Applied coupon is no longer valid.",
    );
  }

  return {
    id:
      cart?._id.toString() ??
      null,

    owner:
      owner.customerId
        ? "CUSTOMER"
        : "GUEST",

    store: {
      id:
        store._id.toString(),

      name:
        store.name,

      code:
        store.code,

      pickupEnabled:
        store.pickupEnabled,

      deliveryEnabled:
        store.deliveryEnabled,
    },

    items:
      activeItems,

    savedForLaterItems,

    coupon,

    promotions: {
      automaticDiscountMinor:
        automaticPromotions
          .discountMinor,

      freeDelivery:
        automaticPromotions
          .freeDelivery,

      applied:
        automaticPromotions
          .promotions,
    },

    totals: {
      currency,

      itemCount:
        activeItems.length,

      subtotalMinor,

      discountMinor:
        totalDiscountMinor,

      estimatedTotalMinor:
        Math.max(
          0,
          subtotalMinor -
            totalDiscountMinor,
        ),
    },

    canCheckout:
      issues.length ===
      0,

    issues,
  };
}

export async function addCartItem(
  owner: CartOwner,
  input: CartMutationItem,
) {
  await assertVariantForCart(
    input.storeId,
    input.productId,
    input.variantId,
    input.quantity,
  );

  const cart =
    await findCart(
      owner,
      input.storeId,
      true,
    );

  if (!cart) {
    throw new Error(
      "Cart creation failed.",
    );
  }

  const existing =
    cart.items.find(
      (item) =>
        item.productId.toString() ===
          input.productId &&
        item.variantId.toString() ===
          input.variantId,
    );

  if (existing) {
    const nextQuantity =
      existing.savedForLater
        ? input.quantity
        : existing.quantity +
          input.quantity;

    await assertVariantForCart(
      input.storeId,
      input.productId,
      input.variantId,
      nextQuantity,
    );

    existing.quantity =
      nextQuantity;

    existing.savedForLater =
      false;
  } else {
    if (
      cart.items.length >=
      200
    ) {
      throw new ApiError(
        409,
        "CART_ITEM_LIMIT_REACHED",
        "A cart can contain at most 200 product options.",
      );
    }

    cart.items.push({
      productId:
        new Types.ObjectId(
          input.productId,
        ),

      variantId:
        new Types.ObjectId(
          input.variantId,
        ),

      quantity:
        input.quantity,

      savedForLater:
        false,

      addedAt:
        new Date(),
    });
  }

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    input.storeId,
  );
}

export async function addCartItems(
  owner: CartOwner,
  storeId: string,
  inputs: Array<{
    productId: string;
    variantId: string;
    quantity: number;
  }>,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      true,
    );

  if (!cart) {
    throw new Error(
      "Cart creation failed.",
    );
  }

  const nextByKey =
    new Map<
      string,
      {
        productId: string;
        variantId: string;
        quantity: number;
        savedForLater: boolean;
        addedAt: Date;
      }
    >();

  for (
    const item of
      cart.items
  ) {
    nextByKey.set(
      `${item.productId.toString()}:${item.variantId.toString()}`,
      {
        productId:
          item.productId.toString(),

        variantId:
          item.variantId.toString(),

        quantity:
          item.quantity,

        savedForLater:
          item.savedForLater,

        addedAt:
          item.addedAt,
      },
    );
  }

  for (
    const input of
      inputs
  ) {
    const key =
      `${input.productId}:${input.variantId}`;

    const existing =
      nextByKey.get(key);

    if (existing) {
      existing.quantity =
        existing.savedForLater
          ? input.quantity
          : existing.quantity +
            input.quantity;

      existing.savedForLater =
        false;
    } else {
      nextByKey.set(
        key,
        {
          productId:
            input.productId,

          variantId:
            input.variantId,

          quantity:
            input.quantity,

          savedForLater:
            false,

          addedAt:
            new Date(),
        },
      );
    }
  }

  if (
    nextByKey.size >
    200
  ) {
    throw new ApiError(
      409,
      "CART_ITEM_LIMIT_REACHED",
      "A cart can contain at most 200 product options.",
    );
  }

  await Promise.all(
    [
      ...nextByKey.values(),
    ]
      .filter(
        (item) =>
          !item.savedForLater,
      )
      .map(
        (item) =>
          assertVariantForCart(
            storeId,
            item.productId,
            item.variantId,
            item.quantity,
          ),
      ),
  );

  cart.set(
    "items",
    [
      ...nextByKey.values(),
    ].map(
      (item) => ({
        productId:
          new Types.ObjectId(
            item.productId,
          ),

        variantId:
          new Types.ObjectId(
            item.variantId,
          ),

        quantity:
          item.quantity,

        savedForLater:
          item.savedForLater,

        addedAt:
          item.addedAt,
      }),
    ),
  );

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function updateCartItem(
  owner: CartOwner,
  storeId: string,
  productId: string,
  variantId: string,
  quantity: number,
) {
  await assertVariantForCart(
    storeId,
    productId,
    variantId,
    quantity,
  );

  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  if (!cart) {
    throw new ApiError(
      404,
      "CART_NOT_FOUND",
      "Cart not found.",
    );
  }

  const item =
    cart.items.find(
      (entry) =>
        entry.productId.toString() ===
          productId &&
        entry.variantId.toString() ===
          variantId,
    );

  if (!item) {
    throw new ApiError(
      404,
      "CART_ITEM_NOT_FOUND",
      "Cart item not found.",
    );
  }

  item.quantity =
    quantity;

  item.savedForLater =
    false;

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function removeCartItem(
  owner: CartOwner,
  storeId: string,
  productId: string,
  variantId: string,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  if (!cart) {
    return getCartQuote(
      owner,
      storeId,
    );
  }

  cart.set(
    "items",
    cart.items.filter(
      (entry) =>
        !(
          entry.productId.toString() ===
            productId &&
          entry.variantId.toString() ===
            variantId
        ),
    ),
  );

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function moveCartItem(
  owner: CartOwner,
  storeId: string,
  productId: string,
  variantId: string,
  savedForLater: boolean,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  if (!cart) {
    throw new ApiError(
      404,
      "CART_NOT_FOUND",
      "Cart not found.",
    );
  }

  const item =
    cart.items.find(
      (entry) =>
        entry.productId.toString() ===
          productId &&
        entry.variantId.toString() ===
          variantId,
    );

  if (!item) {
    throw new ApiError(
      404,
      "CART_ITEM_NOT_FOUND",
      "Cart item not found.",
    );
  }

  if (
    !savedForLater
  ) {
    await assertVariantForCart(
      storeId,
      productId,
      variantId,
      item.quantity,
    );
  }

  item.savedForLater =
    savedForLater;

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function applyCartCoupon(
  owner: CartOwner,
  storeId: string,
  code: string,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      true,
    );

  if (!cart) {
    throw new Error(
      "Cart creation failed.",
    );
  }

  const before =
    await getCartQuote(
      owner,
      storeId,
    );

  if (
    before.items.length ===
    0
  ) {
    throw new ApiError(
      400,
      "CART_EMPTY",
      "Add an item before applying a coupon.",
    );
  }

  const promotionLines =
    before.items.flatMap(
      (item) =>
        item.product
          ? [
              {
                productId:
                  item.productId,

                variantId:
                  item.variantId,

                quantity:
                  item.quantity,

                subtotalMinor:
                  item.lineSubtotalMinor,

                brandId:
                  item.product.brandId,

                categoryIds:
                  item.product.categoryIds,

                collectionIds:
                  item.product.collectionIds,
              },
            ]
          : [],
    );

  const promotionsStackable =
    before.promotions.applied.every(
      (promotion) =>
        promotion.stackableWithCoupons,
    );

  const quote =
    await quoteCoupon({
      code,

      subtotalMinor:
        Math.max(
          0,
          before.totals
            .subtotalMinor -
            before.promotions
              .automaticDiscountMinor,
        ),

      currency:
        before.totals.currency,

      storeId,

      customerId:
        owner.customerId,

      lines:
        promotionLines,

      promotionsStackable,

      hasPromotions:
        before.promotions
          .applied.length >
        0,
    });

  if (
    !quote.valid
  ) {
    throw new ApiError(
      400,
      "COUPON_NOT_VALID",
      quote.message,
    );
  }

  cart.couponCode =
    quote.code;

  if (
    !owner.customerId
  ) {
    cart.expiresAt =
      guestExpiresAt();
  }

  await cart.save();

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function removeCartCoupon(
  owner: CartOwner,
  storeId: string,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  if (cart) {
    cart.couponCode =
      "";

    if (
      !owner.customerId
    ) {
      cart.expiresAt =
        guestExpiresAt();
    }

    await cart.save();
  }

  return getCartQuote(
    owner,
    storeId,
  );
}

export async function clearCart(
  owner: CartOwner,
  storeId: string,
) {
  const cart =
    await findCart(
      owner,
      storeId,
      false,
    );

  if (cart) {
    cart.set(
      "items",
      [],
    );

    cart.couponCode =
      "";

    if (
      !owner.customerId
    ) {
      cart.expiresAt =
        guestExpiresAt();
    }

    await cart.save();
  }

  return getCartQuote(
    owner,
    storeId,
  );
}