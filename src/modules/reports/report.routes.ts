import { Router } from "express";

import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { exportReport, reportData, reportStores } from "./report.controller.js";

export const reportRouter = Router();

reportRouter.use(requireAdminAuth);
reportRouter.get("/stores", requirePermission("reports.read"), asyncHandler(reportStores));
reportRouter.get("/export", requirePermission("reports.export"), asyncHandler(exportReport));
reportRouter.get("/:report", requirePermission("reports.read"), asyncHandler(reportData));
