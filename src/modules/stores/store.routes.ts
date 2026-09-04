import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createStoreRecord,
  getStoreRecord,
  listStoreProductRecords,
  listStoreRecords,
  updateStoreRecord,
  upsertStoreProductRecord,
} from "./store.controller.js";

export const storeRouter = Router();

storeRouter.use(requireAdminAuth);
storeRouter.get("/locations", requirePermission("stores.read"), asyncHandler(listStoreRecords));
storeRouter.get("/locations/:id", requirePermission("stores.read"), asyncHandler(getStoreRecord));
storeRouter.post("/locations", requireCsrf("admin"), requirePermission("stores.create"), asyncHandler(createStoreRecord));
storeRouter.patch("/locations/:id", requireCsrf("admin"), requirePermission("stores.update"), asyncHandler(updateStoreRecord));
storeRouter.get("/products", requirePermission("store-products.read"), asyncHandler(listStoreProductRecords));
storeRouter.put("/products", requireCsrf("admin"), requirePermission("store-products.manage"), asyncHandler(upsertStoreProductRecord));
