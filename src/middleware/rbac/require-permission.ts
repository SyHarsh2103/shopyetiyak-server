import type { RequestHandler } from "express";
import { ApiError } from "../../utils/api-error.js";

export function requirePermission(permissionKey: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || req.auth.kind !== "admin") {
      next(new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required."));
      return;
    }
    if (!req.auth.permissionKeys.includes(permissionKey)) {
      next(new ApiError(403, "PERMISSION_DENIED", "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}

export function requireAnyPermission(permissionKeys: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || req.auth.kind !== "admin") {
      next(new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required."));
      return;
    }
    if (!permissionKeys.some((permissionKey) => req.auth?.kind === "admin" && req.auth.permissionKeys.includes(permissionKey))) {
      next(new ApiError(403, "PERMISSION_DENIED", "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
