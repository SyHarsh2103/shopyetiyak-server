import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { bulkOrderService } from "./bulk-order.service.js";
import {
  bulkIdParamSchema,
  bulkRequestListQuerySchema,
  createBulkOrderRequestSchema,
  createQuoteSchema,
  publicQuoteAccessSchema,
  quoteConversionSchema,
  quoteDepositIntentSchema,
  quoteListQuerySchema,
  updateBulkRequestSchema,
  updateQuoteSchema,
} from "./bulk-order.validation.js";

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

function publicToken(req: Request): string {
  return publicQuoteAccessSchema.parse(req.query).token;
}

export async function postBulkOrderRequest(req: Request, res: Response) {
  const input = createBulkOrderRequestSchema.parse(req.body);
  const customerId = req.auth?.kind === "customer" ? req.auth.customerId : undefined;
  const request = await bulkOrderService.createRequest(input, customerId);
  res.status(201).json({ success: true, data: { request } });
}

export async function getAdminBulkRequests(req: Request, res: Response) {
  admin(req);
  const query = bulkRequestListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await bulkOrderService.listRequests(query) });
}

export async function patchAdminBulkRequest(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = bulkIdParamSchema.parse(req.params);
  const input = updateBulkRequestSchema.parse(req.body);
  const request = await bulkOrderService.updateRequest(id, input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "BULK_REQUEST_UPDATED",
    entityType: "BulkOrderRequest",
    entityId: id,
    after: input,
    request: req,
  });
  res.status(200).json({ success: true, data: { request } });
}

export async function postAdminQuote(req: Request, res: Response) {
  const identity = admin(req);
  const input = createQuoteSchema.parse(req.body);
  const quote = await bulkOrderService.createQuote(input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "QUOTE_CREATED",
    entityType: "Quote",
    entityId: quote.id,
    after: input,
    request: req,
  });
  res.status(201).json({ success: true, data: { quote } });
}

export async function getAdminQuotes(req: Request, res: Response) {
  admin(req);
  const query = quoteListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await bulkOrderService.listQuotes(query) });
}

export async function patchAdminQuote(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = bulkIdParamSchema.parse(req.params);
  const input = updateQuoteSchema.parse(req.body);
  const quote = await bulkOrderService.updateQuote(id, input);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "QUOTE_UPDATED",
    entityType: "Quote",
    entityId: id,
    after: input,
    request: req,
  });
  res.status(200).json({ success: true, data: { quote } });
}

export async function postAdminSendQuote(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = bulkIdParamSchema.parse(req.params);
  const result = await bulkOrderService.sendQuote(id);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "QUOTE_SENT",
    entityType: "Quote",
    entityId: id,
    after: { shareUrlCreated: true },
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}

export async function postAdminCancelQuote(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = bulkIdParamSchema.parse(req.params);
  const quote = await bulkOrderService.cancelQuote(id);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "QUOTE_CANCELLED",
    entityType: "Quote",
    entityId: id,
    after: { status: quote.status },
    request: req,
  });
  res.status(200).json({ success: true, data: { quote } });
}

export async function getPublicQuote(req: Request, res: Response) {
  const { id } = bulkIdParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: await bulkOrderService.getPublicQuote(id, publicToken(req)) });
}

export async function postAcceptQuote(req: Request, res: Response) {
  const { id } = bulkIdParamSchema.parse(req.params);
  const quote = await bulkOrderService.acceptQuote(id, publicToken(req));
  res.status(200).json({ success: true, data: { quote } });
}

export async function postQuoteDepositIntent(req: Request, res: Response) {
  const { id } = bulkIdParamSchema.parse(req.params);
  const input = quoteDepositIntentSchema.parse(req.body);
  const data = await bulkOrderService.createDepositIntent(id, publicToken(req), input.idempotencyKey);
  res.status(201).json({ success: true, data });
}

export async function postConvertQuote(req: Request, res: Response) {
  const identity = admin(req);
  const { id } = bulkIdParamSchema.parse(req.params);
  const input = quoteConversionSchema.parse(req.body);
  const data = await bulkOrderService.convertQuoteToOrder(id, input, {
    adminUserId: identity.adminUserId,
    roleNames: identity.roleNames,
  });
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "QUOTE_CONVERTED_TO_ORDER",
    entityType: "Quote",
    entityId: id,
    after: { orderId: data.orderId },
    request: req,
  });
  res.status(201).json({ success: true, data });
}

export async function postQuoteOrderPaymentIntent(req: Request, res: Response) {
  const { id } = bulkIdParamSchema.parse(req.params);
  const data = await bulkOrderService.ensureConvertedOrderPaymentIntent(id, publicToken(req));
  res.status(200).json({ success: true, data });
}
