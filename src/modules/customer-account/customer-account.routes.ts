import { Router } from "express";

import { requireCustomerAuth } from "../../middleware/auth/customer-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  addresses,
  createAddress,
  createList,
  createListItem,
  createWishlistItem,
  dashboard,
  deleteAddress,
  deleteList,
  deleteListItem,
  deleteWishlistItem,
  patchAddress,
  patchList,
  patchListItem,
  profile,
  reorderValidation,
  shoppingLists,
  wishlist,
} from "./customer-account.controller.js";

export const customerAccountRouter = Router();

customerAccountRouter.use(requireCustomerAuth);

customerAccountRouter.get(
  "/dashboard",
  asyncHandler(dashboard),
);

customerAccountRouter.patch(
  "/profile",
  requireCsrf("customer"),
  asyncHandler(profile),
);

customerAccountRouter.get(
  "/addresses",
  asyncHandler(addresses),
);

customerAccountRouter.post(
  "/addresses",
  requireCsrf("customer"),
  asyncHandler(createAddress),
);

customerAccountRouter.patch(
  "/addresses/:addressId",
  requireCsrf("customer"),
  asyncHandler(patchAddress),
);

customerAccountRouter.delete(
  "/addresses/:addressId",
  requireCsrf("customer"),
  asyncHandler(deleteAddress),
);

customerAccountRouter.get(
  "/wishlist",
  asyncHandler(wishlist),
);

customerAccountRouter.post(
  "/wishlist/items",
  requireCsrf("customer"),
  asyncHandler(createWishlistItem),
);

customerAccountRouter.delete(
  "/wishlist/items/:productId/:variantId",
  requireCsrf("customer"),
  asyncHandler(deleteWishlistItem),
);

customerAccountRouter.get(
  "/shopping-lists",
  asyncHandler(shoppingLists),
);

customerAccountRouter.post(
  "/shopping-lists",
  requireCsrf("customer"),
  asyncHandler(createList),
);

customerAccountRouter.patch(
  "/shopping-lists/:listId",
  requireCsrf("customer"),
  asyncHandler(patchList),
);

customerAccountRouter.delete(
  "/shopping-lists/:listId",
  requireCsrf("customer"),
  asyncHandler(deleteList),
);

customerAccountRouter.post(
  "/shopping-lists/:listId/items",
  requireCsrf("customer"),
  asyncHandler(createListItem),
);

customerAccountRouter.patch(
  "/shopping-lists/:listId/items/:productId/:variantId",
  requireCsrf("customer"),
  asyncHandler(patchListItem),
);

customerAccountRouter.delete(
  "/shopping-lists/:listId/items/:productId/:variantId",
  requireCsrf("customer"),
  asyncHandler(deleteListItem),
);


customerAccountRouter.post(
  "/reorder/validate",
  requireCsrf("customer"),
  asyncHandler(reorderValidation),
);