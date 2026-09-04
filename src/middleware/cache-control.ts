import type { RequestHandler } from "express";

export const noStorePrivateResponses: RequestHandler = (req, res, next) => {
  if (
    req.path.startsWith("/auth/") ||
    req.path.startsWith("/customer/") ||
    req.path.startsWith("/cart") ||
    req.path.startsWith("/checkout") ||
    req.path.startsWith("/orders") ||
    req.path.startsWith("/payments") ||
    req.path.startsWith("/admin/")
  ) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
  }
  next();
};
