import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createPurchaseOrderRecord,
  createSupplierReturnRecord,
  getPurchaseOrderRecord,
  listGoodsReceiptRecords,
  listPurchaseOrderRecords,
  listSupplierReturnRecords,
  receiveGoodsRecord,
  transitionPurchaseOrderRecord,
  updatePurchaseOrderRecord,
} from "./purchasing.controller.js";

export const purchasingRouter = Router();

purchasingRouter.use(requireAdminAuth);

purchasingRouter.get("/purchase-orders", requirePermission("purchase-orders.read"), asyncHandler(listPurchaseOrderRecords));
purchasingRouter.get("/purchase-orders/:id", requirePermission("purchase-orders.read"), asyncHandler(getPurchaseOrderRecord));
purchasingRouter.post("/purchase-orders", requireCsrf("admin"), requirePermission("purchase-orders.create"), asyncHandler(createPurchaseOrderRecord));
purchasingRouter.patch("/purchase-orders/:id", requireCsrf("admin"), requirePermission("purchase-orders.update"), asyncHandler(updatePurchaseOrderRecord));
purchasingRouter.post("/purchase-orders/:id/status", requireCsrf("admin"), requirePermission("purchase-orders.status"), asyncHandler(transitionPurchaseOrderRecord));

purchasingRouter.get("/goods-receipts", requirePermission("goods-receipts.read"), asyncHandler(listGoodsReceiptRecords));
purchasingRouter.post("/goods-receipts", requireCsrf("admin"), requirePermission("goods-receipts.create"), asyncHandler(receiveGoodsRecord));

purchasingRouter.get("/supplier-returns", requirePermission("supplier-returns.read"), asyncHandler(listSupplierReturnRecords));
purchasingRouter.post("/supplier-returns", requireCsrf("admin"), requirePermission("supplier-returns.create"), asyncHandler(createSupplierReturnRecord));
