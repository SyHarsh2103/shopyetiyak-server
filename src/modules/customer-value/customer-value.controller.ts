import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  adjustGiftCard,
  adjustLoyalty,
  adjustStoreCredit,
  cancelBackInStock,
  checkGiftCard,
  createGiftCard,
  dispatchBackInStockAlerts,
  getCustomerValueSummary,
  listBackInStockSubscriptions,
  listGiftCards,
  adminListCustomerValue,
  subscribeBackInStock,
  updateGiftCardStatus,
} from "./customer-value.service.js";
import {
  adminCustomerValueListQuerySchema,
  adminGiftCardAdjustmentSchema,
  adminGiftCardCreateSchema,
  adminGiftCardStatusSchema,
  adminLoyaltyAdjustmentSchema,
  adminStoreCreditAdjustmentSchema,
  backInStockAdminQuerySchema,
  backInStockCancelSchema,
  backInStockSubscribeSchema,
  giftCardIdParamSchema,
} from "./customer-value.validation.js";

function customerId(req: Request): string {
  if (!req.auth || req.auth.kind !== "customer") {
    throw new ApiError(401, "AUTH_REQUIRED", "Customer authentication is required.");
  }
  return req.auth.customerId;
}

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "ADMIN_AUTH_REQUIRED", "Administrator authentication is required.");
  }
  return req.auth;
}

export async function customerValueSummary(req: Request, res: Response): Promise<void> {
  const data = await getCustomerValueSummary(customerId(req));
  res.status(200).json({ success: true, data });
}

export async function giftCardBalance(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code.trim()) throw new ApiError(400, "GIFT_CARD_CODE_REQUIRED", "Gift-card code is required.");
  const giftCard = await checkGiftCard(code);
  res.status(200).json({ success: true, data: { giftCard } });
}

export async function createBackInStockSubscription(req: Request, res: Response): Promise<void> {
  const input = backInStockSubscribeSchema.parse(req.body);
  const signedInCustomerId = req.auth?.kind === "customer" ? req.auth.customerId : undefined;
  const subscription = await subscribeBackInStock(input, signedInCustomerId);
  res.status(201).json({ success: true, data: { subscription } });
}

export async function cancelBackInStockSubscription(req: Request, res: Response): Promise<void> {
  const input = backInStockCancelSchema.parse(req.body);
  const subscription = await cancelBackInStock(input.subscriptionId, input.token);
  res.status(200).json({ success: true, data: { subscription } });
}

export async function adminCustomerValues(req: Request, res: Response): Promise<void> {
  const query = adminCustomerValueListQuerySchema.parse(req.query);
  const data = await adminListCustomerValue(query);
  res.status(200).json({ success: true, data });
}

export async function adminAdjustLoyalty(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = adminLoyaltyAdjustmentSchema.parse(req.body);
  const result = await adjustLoyalty(input, identity.adminUserId);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "LOYALTY_ADJUSTMENT",
    entityType: "Customer",
    entityId: input.customerId,
    after: result,
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}

export async function adminAdjustStoreCredit(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = adminStoreCreditAdjustmentSchema.parse(req.body);
  const result = await adjustStoreCredit(input, identity.adminUserId);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "STORE_CREDIT_ADJUSTMENT",
    entityType: "Customer",
    entityId: input.customerId,
    after: result,
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}

export async function adminGiftCards(req: Request, res: Response): Promise<void> {
  const query = adminCustomerValueListQuerySchema.parse(req.query);
  const data = await listGiftCards(query);
  res.status(200).json({ success: true, data });
}

export async function adminCreateGiftCard(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const input = adminGiftCardCreateSchema.parse(req.body);
  const result = await createGiftCard(input, identity.adminUserId);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "GIFT_CARD_ISSUE",
    entityType: "GiftCard",
    entityId: result.giftCard.id,
    after: result.giftCard,
    request: req,
  });
  res.status(201).json({ success: true, data: result });
}

export async function adminAdjustGiftCard(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { giftCardId } = giftCardIdParamSchema.parse(req.params);
  const input = adminGiftCardAdjustmentSchema.parse(req.body);
  const giftCard = await adjustGiftCard(giftCardId, input.amountDeltaMinor, input.note, identity.adminUserId);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "GIFT_CARD_ADJUSTMENT",
    entityType: "GiftCard",
    entityId: giftCardId,
    after: giftCard,
    request: req,
  });
  res.status(200).json({ success: true, data: { giftCard } });
}

export async function adminSetGiftCardStatus(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { giftCardId } = giftCardIdParamSchema.parse(req.params);
  const input = adminGiftCardStatusSchema.parse(req.body);
  const giftCard = await updateGiftCardStatus(giftCardId, input.status);
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "GIFT_CARD_STATUS_CHANGE",
    entityType: "GiftCard",
    entityId: giftCardId,
    after: giftCard,
    request: req,
  });
  res.status(200).json({ success: true, data: { giftCard } });
}

export async function adminBackInStockSubscriptions(req: Request, res: Response): Promise<void> {
  const query = backInStockAdminQuerySchema.parse(req.query);
  const data = await listBackInStockSubscriptions(query);
  res.status(200).json({ success: true, data });
}

export async function adminDispatchBackInStock(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const result = await dispatchBackInStockAlerts();
  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "BACK_IN_STOCK_DISPATCH",
    entityType: "BackInStockSubscription",
    entityId: "batch",
    after: result,
    request: req,
  });
  res.status(200).json({ success: true, data: result });
}
