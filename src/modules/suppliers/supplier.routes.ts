import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createSupplierRecord,
  getSupplierRecord,
  listSupplierProductRecords,
  listSupplierRecords,
  updateSupplierRecord,
  upsertSupplierProductRecord,
} from "./supplier.controller.js";

export const supplierRouter = Router();

supplierRouter.use(requireAdminAuth);
supplierRouter.get("/products/list", requirePermission("supplier-products.read"), asyncHandler(listSupplierProductRecords));
supplierRouter.put("/products/map", requireCsrf("admin"), requirePermission("supplier-products.manage"), asyncHandler(upsertSupplierProductRecord));
supplierRouter.get("/", requirePermission("suppliers.read"), asyncHandler(listSupplierRecords));
supplierRouter.post("/", requireCsrf("admin"), requirePermission("suppliers.create"), asyncHandler(createSupplierRecord));
supplierRouter.get("/:id", requirePermission("suppliers.read"), asyncHandler(getSupplierRecord));
supplierRouter.patch("/:id", requireCsrf("admin"), requirePermission("suppliers.update"), asyncHandler(updateSupplierRecord));
