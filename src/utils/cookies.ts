import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";

export const COOKIE_NAMES = {
  customerAccess: "grocery_customer_access",
  customerRefresh: "grocery_customer_refresh",
  customerCsrf: "grocery_customer_csrf",
  guestCart: "grocery_guest_cart",
  adminAccess: "grocery_admin_access",
  adminRefresh: "grocery_admin_refresh",
  adminCsrf: "grocery_admin_csrf",
} as const;

function baseCookieOptions(httpOnly: boolean): CookieOptions {
  return {
    httpOnly,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN,
    path: "/",
  };
}


export function setGuestCartCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAMES.guestCart, token, {
    ...baseCookieOptions(true),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearGuestCartCookie(res: Response): void {
  res.clearCookie(COOKIE_NAMES.guestCart, baseCookieOptions(true));
}

export function setCustomerAuthCookies(res: Response, access: string, refresh: string): void {
  res.cookie(COOKIE_NAMES.customerAccess, access, {
    ...baseCookieOptions(true),
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(COOKIE_NAMES.customerRefresh, refresh, {
    ...baseCookieOptions(true),
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setAdminAuthCookies(res: Response, access: string, refresh: string): void {
  res.cookie(COOKIE_NAMES.adminAccess, access, {
    ...baseCookieOptions(true),
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(COOKIE_NAMES.adminRefresh, refresh, {
    ...baseCookieOptions(true),
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setCsrfCookie(res: Response, scope: "customer" | "admin", token: string): void {
  const name = scope === "customer" ? COOKIE_NAMES.customerCsrf : COOKIE_NAMES.adminCsrf;
  res.cookie(name, token, { ...baseCookieOptions(false), maxAge: 24 * 60 * 60 * 1000 });
}

export function clearCustomerAuthCookies(res: Response): void {
  res.clearCookie(COOKIE_NAMES.customerAccess, baseCookieOptions(true));
  res.clearCookie(COOKIE_NAMES.customerRefresh, baseCookieOptions(true));
}

export function clearAdminAuthCookies(res: Response): void {
  res.clearCookie(COOKIE_NAMES.adminAccess, baseCookieOptions(true));
  res.clearCookie(COOKIE_NAMES.adminRefresh, baseCookieOptions(true));
}
