import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export const cartQuerySchema = z.object({
  storeId: objectId,
});

export const cartItemSchema = z.object({
  storeId: objectId,
  productId: objectId,
  variantId: objectId,
  quantity: z.number().positive().max(100000),
});

export const cartBulkItemsSchema = z.object({
  storeId: objectId,
  items: z.array(z.object({
    productId: objectId,
    variantId: objectId,
    quantity: z.number().positive().max(100000),
  })).min(1).max(100),
});

export const cartItemParamsSchema = z.object({
  productId: objectId,
  variantId: objectId,
});

export const cartItemUpdateSchema = z.object({
  storeId: objectId,
  quantity: z.number().positive().max(100000),
});

export const cartItemMoveSchema = z.object({
  storeId: objectId,
  savedForLater: z.boolean(),
});

export const cartCouponSchema = z.object({
  storeId: objectId,
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
});

export const cartStoreBodySchema = z.object({
  storeId: objectId,
});
