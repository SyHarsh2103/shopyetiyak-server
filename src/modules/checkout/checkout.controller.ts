import type { Request, Response } from "express";

import { COOKIE_NAMES, setGuestCartCookie } from "../../utils/cookies.js";
import { createOpaqueToken } from "../../utils/crypto.js";
import type { CartOwner } from "../carts/cart.service.js";
import { buildCheckoutReview } from "./checkout.service.js";
import { checkoutReviewSchema } from "./checkout.validation.js";

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

export async function reviewCheckout(req: Request, res: Response): Promise<void> {
  const input = checkoutReviewSchema.parse(req.body);
  const data = await buildCheckoutReview(cartOwner(req, res), input);
  res.status(200).json({ success: true, data });
}
