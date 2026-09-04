import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { issueCsrfToken, requireCsrf } from "../../middleware/csrf.js";
import { authRateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { adminCompletePasswordSetup, adminLogin, adminLogout, adminLogoutAll, adminMe, adminRefresh } from "./admin-auth.controller.js";

export const adminAuthRouter = Router();
adminAuthRouter.get("/csrf", issueCsrfToken("admin"));
adminAuthRouter.post("/login", authRateLimit, requireCsrf("admin"), asyncHandler(adminLogin));
adminAuthRouter.post("/setup-password", authRateLimit, asyncHandler(adminCompletePasswordSetup));
adminAuthRouter.post("/refresh", authRateLimit, requireCsrf("admin"), asyncHandler(adminRefresh));
adminAuthRouter.post("/logout", requireCsrf("admin"), asyncHandler(adminLogout));
adminAuthRouter.get("/me", requireAdminAuth, asyncHandler(adminMe));
adminAuthRouter.post("/logout-all", requireAdminAuth, requireCsrf("admin"), asyncHandler(adminLogoutAll));
