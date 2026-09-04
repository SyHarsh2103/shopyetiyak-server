import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import type { CartOwner } from "../carts/cart.service.js";
import { COOKIE_NAMES, setGuestCartCookie } from "../../utils/cookies.js";
import { createOpaqueToken } from "../../utils/crypto.js";
import { paymentService } from "./payment.service.js";
import {
  createPaymentIntentSchema,
  paymentCancelSchema,
  paymentCaptureSchema,
  paymentIdParamSchema,
  paymentRefundSchema,
} from "./payment.validation.js";

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function cartOwner(req: Request, res?: Response): CartOwner {
  const customerId = req.auth?.kind === "customer" ? req.auth.customerId : undefined;
  let guestToken = readCookie(req, COOKIE_NAMES.guestCart);

  if (!customerId && !guestToken && res) {
    guestToken = createOpaqueToken();
    setGuestCartCookie(res, guestToken);
  }

  return { customerId, guestToken };
}

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new Error("Admin authentication middleware was not applied.");
  }
  return req.auth;
}

export async function createPaymentIntentRecord(req: Request, res: Response): Promise<void> {
  const input = createPaymentIntentSchema.parse(req.body);
  const data = await paymentService.createCheckoutPaymentIntent(cartOwner(req, res), input);
  res.status(201).json({ success: true, data });
}

export async function getPaymentRecord(req: Request, res: Response): Promise<void> {
  const { paymentId } = paymentIdParamSchema.parse(req.params);
  const payment = await paymentService.getPaymentForOwner(cartOwner(req), paymentId);
  res.status(200).json({ success: true, data: { payment } });
}

export async function capturePaymentRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { paymentId } = paymentIdParamSchema.parse(req.params);
  const input = paymentCaptureSchema.parse(req.body);
  const payment = await paymentService.capturePayment(paymentId, input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "PAYMENT_CAPTURE",
    entityType: "Payment",
    entityId: paymentId,
    after: payment,
    request: req,
  });
  res.status(200).json({ success: true, data: { payment } });
}

export async function cancelPaymentRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { paymentId } = paymentIdParamSchema.parse(req.params);
  const input = paymentCancelSchema.parse(req.body);
  const payment = await paymentService.cancelPayment(paymentId, input.idempotencyKey);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "PAYMENT_CANCEL",
    entityType: "Payment",
    entityId: paymentId,
    after: payment,
    request: req,
  });
  res.status(200).json({ success: true, data: { payment } });
}

export async function refundPaymentRecord(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { paymentId } = paymentIdParamSchema.parse(req.params);
  const input = paymentRefundSchema.parse(req.body);
  const result = await paymentService.refundPayment(paymentId, input, {
    adminUserId: identity.adminUserId,
    roleNames: identity.roleNames,
  });
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "PAYMENT_REFUND",
    entityType: "Payment",
    entityId: paymentId,
    after: result,
    request: req,
  });
  res.status(201).json({ success: true, data: result });
}
