import type { Request, RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";
import { COOKIE_NAMES, setCsrfCookie } from "../utils/cookies.js";
import { createOpaqueToken, secureStringEqual } from "../utils/crypto.js";

export type CsrfScope = "customer" | "admin";

function cookieName(scope: CsrfScope): string {
  return scope === "customer"
    ? COOKIE_NAMES.customerCsrf
    : COOKIE_NAMES.adminCsrf;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;

  if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) {
    return undefined;
  }

  const value = (cookies as Record<string, unknown>)[name];

  return typeof value === "string" ? value : undefined;
}

export function issueCsrfToken(scope: CsrfScope): RequestHandler {
  return (req, res) => {
    const existing = readCookie(req, cookieName(scope));
    const token =
      existing && existing.length >= 32 ? existing : createOpaqueToken();

    if (token !== existing) {
      setCsrfCookie(res, scope, token);
    }

    res.status(200).json({
      success: true,
      data: {
        csrfToken: token,
      },
    });
  };
}

export function requireCsrf(scope: CsrfScope): RequestHandler {
  return (req, _res, next) => {
    const cookieToken = readCookie(req, cookieName(scope));
    const header = req.get("x-csrf-token");

    if (
      !cookieToken ||
      !header ||
      !secureStringEqual(cookieToken, header)
    ) {
      next(
        new ApiError(
          403,
          "CSRF_VALIDATION_FAILED",
          "The request could not be verified.",
        ),
      );
      return;
    }

    next();
  };
}