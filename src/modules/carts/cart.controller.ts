import type { Request, Response } from "express";

import { COOKIE_NAMES, setGuestCartCookie } from "../../utils/cookies.js";
import { createOpaqueToken } from "../../utils/crypto.js";
import {
  addCartItem,
  addCartItems,
  applyCartCoupon,
  clearCart,
  getCartQuote,
  moveCartItem,
  removeCartCoupon,
  removeCartItem,
  updateCartItem,
  type CartOwner,
} from "./cart.service.js";
import {
  cartBulkItemsSchema,
  cartCouponSchema,
  cartItemMoveSchema,
  cartItemParamsSchema,
  cartItemSchema,
  cartItemUpdateSchema,
  cartQuerySchema,
  cartStoreBodySchema,
} from "./cart.validation.js";

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function cartOwner(req: Request, res: Response): CartOwner {
  const customerId =
    req.auth?.kind === "customer" ? req.auth.customerId : undefined;
  let guestToken = readCookie(req, COOKIE_NAMES.guestCart);

  if (!customerId && !guestToken) {
    guestToken = createOpaqueToken();
    setGuestCartCookie(res, guestToken);
  }

  return { customerId, guestToken };
}

export async function getCart(req: Request, res: Response): Promise<void> {
  const { storeId } = cartQuerySchema.parse(req.query);
  const data = await getCartQuote(cartOwner(req, res), storeId);
  res.status(200).json({ success: true, data });
}

export async function createCartItem(req: Request, res: Response): Promise<void> {
  const input = cartItemSchema.parse(req.body);
  const data = await addCartItem(cartOwner(req, res), input);
  res.status(201).json({ success: true, data });
}

export async function createCartItems(req: Request, res: Response): Promise<void> {
  const { storeId, items } = cartBulkItemsSchema.parse(req.body);
  const data = await addCartItems(cartOwner(req, res), storeId, items);
  res.status(201).json({ success: true, data });
}

export async function patchCartItem(req: Request, res: Response): Promise<void> {
  const { productId, variantId } = cartItemParamsSchema.parse(req.params);
  const { storeId, quantity } = cartItemUpdateSchema.parse(req.body);
  const data = await updateCartItem(
    cartOwner(req, res),
    storeId,
    productId,
    variantId,
    quantity,
  );
  res.status(200).json({ success: true, data });
}

export async function deleteCartItem(req: Request, res: Response): Promise<void> {
  const { productId, variantId } = cartItemParamsSchema.parse(req.params);
  const { storeId } = cartStoreBodySchema.parse(req.body);
  const data = await removeCartItem(
    cartOwner(req, res),
    storeId,
    productId,
    variantId,
  );
  res.status(200).json({ success: true, data });
}

export async function patchCartItemState(req: Request, res: Response): Promise<void> {
  const { productId, variantId } = cartItemParamsSchema.parse(req.params);
  const { storeId, savedForLater } = cartItemMoveSchema.parse(req.body);
  const data = await moveCartItem(
    cartOwner(req, res),
    storeId,
    productId,
    variantId,
    savedForLater,
  );
  res.status(200).json({ success: true, data });
}

export async function applyCoupon(req: Request, res: Response): Promise<void> {
  const { storeId, code } = cartCouponSchema.parse(req.body);
  const data = await applyCartCoupon(cartOwner(req, res), storeId, code);
  res.status(200).json({ success: true, data });
}

export async function deleteCoupon(req: Request, res: Response): Promise<void> {
  const { storeId } = cartStoreBodySchema.parse(req.body);
  const data = await removeCartCoupon(cartOwner(req, res), storeId);
  res.status(200).json({ success: true, data });
}

export async function deleteCart(req: Request, res: Response): Promise<void> {
  const { storeId } = cartStoreBodySchema.parse(req.body);
  const data = await clearCart(cartOwner(req, res), storeId);
  res.status(200).json({ success: true, data });
}
