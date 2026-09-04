import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  adjustInventoryRecord,
  commitInventoryRecord,
  listBatchRecords,
  listInventoryRecords,
  listTransactionRecords,
  receiveBatchRecord,
  releaseInventoryRecord,
  reserveInventoryRecord,
  transferInventoryRecord,
  updateReorderPolicyRecord,
} from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.use(requireAdminAuth);
inventoryRouter.get("/", requirePermission("inventory.read"), asyncHandler(listInventoryRecords));
inventoryRouter.patch("/:id/reorder-policy", requireCsrf("admin"), requirePermission("inventory.adjust"), asyncHandler(updateReorderPolicyRecord));
inventoryRouter.post("/adjustments", requireCsrf("admin"), requirePermission("inventory.adjust"), asyncHandler(adjustInventoryRecord));
inventoryRouter.post("/reservations", requireCsrf("admin"), requirePermission("inventory.reserve"), asyncHandler(reserveInventoryRecord));
inventoryRouter.post("/reservations/release", requireCsrf("admin"), requirePermission("inventory.reserve"), asyncHandler(releaseInventoryRecord));
inventoryRouter.post("/reservations/commit", requireCsrf("admin"), requirePermission("inventory.reserve"), asyncHandler(commitInventoryRecord));
inventoryRouter.post("/transfers", requireCsrf("admin"), requirePermission("inventory.transfer"), asyncHandler(transferInventoryRecord));
inventoryRouter.get("/batches", requirePermission("inventory-batches.read"), asyncHandler(listBatchRecords));
inventoryRouter.post("/batches/receive", requireCsrf("admin"), requirePermission("inventory-batches.receive"), asyncHandler(receiveBatchRecord));
inventoryRouter.get("/transactions", requirePermission("inventory-transactions.read"), asyncHandler(listTransactionRecords));
