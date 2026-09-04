import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  accountStoreQuerySchema,
  addressInputSchema,
  addressParamsSchema,
  createShoppingListSchema,
  profileUpdateSchema,
  reorderValidationSchema,
  shoppingListItemParamsSchema,
  shoppingListItemSchema,
  shoppingListParamsSchema,
  updateShoppingListItemSchema,
  wishlistItemParamsSchema,
  wishlistItemSchema,
} from "./customer-account.validation.js";
import {
  addAddress,
  addShoppingListItem,
  addWishlistItem,
  createShoppingList,
  deleteShoppingList,
  getAccountDashboard,
  getWishlist,
  listAddresses,
  listShoppingLists,
  removeAddress,
  removeShoppingListItem,
  removeWishlistItem,
  renameShoppingList,
  updateAddress,
  updateProfile,
  updateShoppingListItem,
  validateReorder,
} from "./customer-account.service.js";

function requireCustomer(req: Request) {
  if (!req.auth || req.auth.kind !== "customer") {
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Customer authentication is required.",
    );
  }

  return req.auth;
}

export async function dashboard(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  res.status(200).json({
    success: true,
    data: await getAccountDashboard(
      auth.customerId,
    ),
  });
}

export async function profile(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const before =
    await getAccountDashboard(
      auth.customerId,
    );

  const customer =
    await updateProfile(
      auth.customerId,
      profileUpdateSchema.parse(
        req.body,
      ),
    );

  await writeAudit({
    actorType: "CUSTOMER",
    actorId: auth.customerId,
    action:
      "CUSTOMER_PROFILE_UPDATED",
    entityType: "Customer",
    entityId: auth.customerId,
    before: before.customer,
    after: customer,
    request: req,
  });

  res.status(200).json({
    success: true,
    data: {
      customer,
    },
  });
}

export async function addresses(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  res.status(200).json({
    success: true,
    data: {
      addresses:
        await listAddresses(
          auth.customerId,
        ),
    },
  });
}

export async function createAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const address =
    await addAddress(
      auth.customerId,
      addressInputSchema.parse(
        req.body,
      ),
    );

  await writeAudit({
    actorType: "CUSTOMER",
    actorId: auth.customerId,
    action:
      "CUSTOMER_ADDRESS_CREATED",
    entityType:
      "CustomerAddress",
    entityId: address.id,
    after: address,
    request: req,
  });

  res.status(201).json({
    success: true,
    data: {
      address,
    },
  });
}

export async function patchAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    addressId,
  } =
    addressParamsSchema.parse(
      req.params,
    );

  const address =
    await updateAddress(
      auth.customerId,
      addressId,
      addressInputSchema.parse(
        req.body,
      ),
    );

  await writeAudit({
    actorType: "CUSTOMER",
    actorId: auth.customerId,
    action:
      "CUSTOMER_ADDRESS_UPDATED",
    entityType:
      "CustomerAddress",
    entityId: addressId,
    after: address,
    request: req,
  });

  res.status(200).json({
    success: true,
    data: {
      address,
    },
  });
}

export async function deleteAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    addressId,
  } =
    addressParamsSchema.parse(
      req.params,
    );

  await removeAddress(
    auth.customerId,
    addressId,
  );

  await writeAudit({
    actorType: "CUSTOMER",
    actorId: auth.customerId,
    action:
      "CUSTOMER_ADDRESS_DELETED",
    entityType:
      "CustomerAddress",
    entityId: addressId,
    request: req,
  });

  res.status(200).json({
    success: true,
    data: {
      deleted: true,
    },
  });
}

export async function wishlist(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    storeId,
  } =
    accountStoreQuerySchema.parse(
      req.query,
    );

  res.status(200).json({
    success: true,
    data: await getWishlist(
      auth.customerId,
      storeId,
    ),
  });
}

export async function createWishlistItem(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  await addWishlistItem(
    auth.customerId,
    wishlistItemSchema.parse(
      req.body,
    ),
  );

  res.status(201).json({
    success: true,
    data: {
      added: true,
    },
  });
}

export async function deleteWishlistItem(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    productId,
    variantId,
  } =
    wishlistItemParamsSchema.parse(
      req.params,
    );

  await removeWishlistItem(
    auth.customerId,
    productId,
    variantId,
  );

  res.status(200).json({
    success: true,
    data: {
      removed: true,
    },
  });
}

export async function shoppingLists(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    storeId,
  } =
    accountStoreQuerySchema.parse(
      req.query,
    );

  res.status(200).json({
    success: true,
    data:
      await listShoppingLists(
        auth.customerId,
        storeId,
      ),
  });
}

export async function createList(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const list =
    await createShoppingList(
      auth.customerId,
      createShoppingListSchema.parse(
        req.body,
      ),
    );

  res.status(201).json({
    success: true,
    data: {
      list,
    },
  });
}

export async function patchList(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    listId,
  } =
    shoppingListParamsSchema.parse(
      req.params,
    );

  const list =
    await renameShoppingList(
      auth.customerId,
      listId,
      createShoppingListSchema.parse(
        req.body,
      ),
    );

  res.status(200).json({
    success: true,
    data: {
      list,
    },
  });
}

export async function deleteList(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    listId,
  } =
    shoppingListParamsSchema.parse(
      req.params,
    );

  await deleteShoppingList(
    auth.customerId,
    listId,
  );

  res.status(200).json({
    success: true,
    data: {
      deleted: true,
    },
  });
}

export async function createListItem(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    listId,
  } =
    shoppingListParamsSchema.parse(
      req.params,
    );

  await addShoppingListItem(
    auth.customerId,
    listId,
    shoppingListItemSchema.parse(
      req.body,
    ),
  );

  res.status(201).json({
    success: true,
    data: {
      saved: true,
    },
  });
}

export async function patchListItem(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    listId,
    productId,
    variantId,
  } =
    shoppingListItemParamsSchema.parse(
      req.params,
    );

  await updateShoppingListItem(
    auth.customerId,
    listId,
    productId,
    variantId,
    updateShoppingListItemSchema.parse(
      req.body,
    ),
  );

  res.status(200).json({
    success: true,
    data: {
      updated: true,
    },
  });
}

export async function deleteListItem(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireCustomer(req);

  const {
    listId,
    productId,
    variantId,
  } =
    shoppingListItemParamsSchema.parse(
      req.params,
    );

  await removeShoppingListItem(
    auth.customerId,
    listId,
    productId,
    variantId,
  );

  res.status(200).json({
    success: true,
    data: {
      removed: true,
    },
  });
}

export async function reorderValidation(
  req: Request,
  res: Response,
): Promise<void> {
  requireCustomer(req);

  res.status(200).json({
    success: true,
    data:
      await validateReorder(
        reorderValidationSchema.parse(
          req.body,
        ),
      ),
  });
}
