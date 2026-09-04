import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";

export const adminSystemRouter = Router();
adminSystemRouter.get("/permission-check", requireAdminAuth, requirePermission("settings.manage"), (req, res) => {
  res.status(200).json({ success: true, data: { authorized: true, auth: req.auth } });
});
