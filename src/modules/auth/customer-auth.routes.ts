import { Router } from "express";
import { requireCustomerAuth } from "../../middleware/auth/customer-auth.js";
import { issueCsrfToken, requireCsrf } from "../../middleware/csrf.js";
import { authRateLimit, sensitiveAuthRateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  confirmVerification, forgotPassword, login, logout, logoutAll, me, refresh, register,
  resetPassword, revokeSession, sendVerification, sessions,
} from "./customer-auth.controller.js";

export const customerAuthRouter = Router();
customerAuthRouter.get("/csrf", issueCsrfToken("customer"));
customerAuthRouter.post("/register", authRateLimit, requireCsrf("customer"), asyncHandler(register));
customerAuthRouter.post("/login", authRateLimit, requireCsrf("customer"), asyncHandler(login));
customerAuthRouter.post("/refresh", authRateLimit, requireCsrf("customer"), asyncHandler(refresh));
customerAuthRouter.post("/logout", requireCsrf("customer"), asyncHandler(logout));
customerAuthRouter.get("/me", requireCustomerAuth, asyncHandler(me));
customerAuthRouter.get("/sessions", requireCustomerAuth, asyncHandler(sessions));
customerAuthRouter.delete("/sessions/:sessionId", requireCustomerAuth, requireCsrf("customer"), asyncHandler(revokeSession));
customerAuthRouter.post("/logout-all", requireCustomerAuth, requireCsrf("customer"), asyncHandler(logoutAll));
customerAuthRouter.post("/verify-email/request", sensitiveAuthRateLimit, requireCustomerAuth, requireCsrf("customer"), asyncHandler(sendVerification));
customerAuthRouter.post("/verify-email/confirm", sensitiveAuthRateLimit, requireCsrf("customer"), asyncHandler(confirmVerification));
customerAuthRouter.post("/forgot-password", sensitiveAuthRateLimit, requireCsrf("customer"), asyncHandler(forgotPassword));
customerAuthRouter.post("/reset-password", sensitiveAuthRateLimit, requireCsrf("customer"), asyncHandler(resetPassword));
