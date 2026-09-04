import { Router } from "express";

import { optionalCustomerAuth } from "../../middleware/auth/optional-customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  applyCoupon,
  createCartItem,
  createCartItems,
  deleteCart,
  deleteCartItem,
  deleteCoupon,
  getCart,
  patchCartItem,
  patchCartItemState,
} from "./cart.controller.js";

export const cartRouter = Router();

cartRouter.use(optionalCustomerAuth);

cartRouter.get("/", asyncHandler(getCart));
cartRouter.post("/items", requireCsrf("customer"), asyncHandler(createCartItem));
cartRouter.post("/items/bulk", requireCsrf("customer"), asyncHandler(createCartItems));
cartRouter.patch(
  "/items/:productId/:variantId",
  requireCsrf("customer"),
  asyncHandler(patchCartItem),
);
cartRouter.patch(
  "/items/:productId/:variantId/state",
  requireCsrf("customer"),
  asyncHandler(patchCartItemState),
);
cartRouter.delete(
  "/items/:productId/:variantId",
  requireCsrf("customer"),
  asyncHandler(deleteCartItem),
);
cartRouter.post("/coupon", requireCsrf("customer"), asyncHandler(applyCoupon));
cartRouter.delete("/coupon", requireCsrf("customer"), asyncHandler(deleteCoupon));
cartRouter.delete("/", requireCsrf("customer"), asyncHandler(deleteCart));
