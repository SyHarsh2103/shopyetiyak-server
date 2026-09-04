import mongoose, { type ClientSession, Types } from "mongoose";
import { randomBytes } from "node:crypto";
import type { z } from "zod";

import { CustomerModel } from "../customers/customer.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { env } from "../../config/env.js";
import { sendEmail } from "../../services/email/email.service.js";
import { ApiError } from "../../utils/api-error.js";
import { createOpaqueToken, sha256 } from "../../utils/crypto.js";
import { BackInStockSubscriptionModel } from "./back-in-stock-subscription.model.js";
import { GiftCardModel } from "./gift-card.model.js";
import { GiftCardTransactionModel } from "./gift-card-transaction.model.js";
import { LoyaltyAccountModel } from "./loyalty-account.model.js";
import { LoyaltyTransactionModel } from "./loyalty-transaction.model.js";
import { StoreCreditAccountModel } from "./store-credit-account.model.js";
import { StoreCreditTransactionModel } from "./store-credit-transaction.model.js";
import type {
  adminCustomerValueListQuerySchema,
  adminGiftCardCreateSchema,
  adminLoyaltyAdjustmentSchema,
  adminStoreCreditAdjustmentSchema,
  backInStockAdminQuerySchema,
  backInStockSubscribeSchema,
  valueRedemptionInputSchema,
} from "./customer-value.validation.js";

export const CUSTOMER_VALUE_POLICY = {
  loyaltyEarnPointsPerCurrencyUnit: 1,
  loyaltyRedemptionMinorPerPoint: 1,
  minimumLoyaltyRedemptionPoints: 100,
} as const;

type ValueRedemptionInput = z.infer<typeof valueRedemptionInputSchema>;
type AdminListQuery = z.infer<typeof adminCustomerValueListQuerySchema>;
type LoyaltyAdjustmentInput = z.infer<typeof adminLoyaltyAdjustmentSchema>;
type StoreCreditAdjustmentInput = z.infer<typeof adminStoreCreditAdjustmentSchema>;
type GiftCardCreateInput = z.infer<typeof adminGiftCardCreateSchema>;
type BackInStockInput = z.infer<typeof backInStockSubscribeSchema>;
type BackInStockAdminQuery = z.infer<typeof backInStockAdminQuerySchema>;

export interface ResolvedValueRedemptions {
  loyaltyPoints: number;
  loyaltyMinor: number;
  storeCreditMinor: number;
  giftCardId: string | null;
  giftCardLastFour: string;
  giftCardMinor: number;
  totalMinor: number;
}

export interface OrderValueSnapshotLike {
  loyaltyPointsRedeemed?: number;
  loyaltyMinor?: number;
  storeCreditMinor?: number;
  giftCardId?: Types.ObjectId | null;
  giftCardLastFour?: string;
  giftCardMinor?: number;
  loyaltyPointsEarned?: number;
  loyaltyPointsRestored?: number;
  storeCreditRestoredMinor?: number;
  giftCardRestoredMinor?: number;
  fulfillmentRestoredMinor?: number;
  fulfillmentReconciledAt?: Date | null;
  redemptionsReversedAt?: Date | null;
  loyaltyEarnReversedAt?: Date | null;
}

function normalizeGiftCardCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function generateGiftCardCode(): string {
  const raw = randomBytes(12).toString("hex").toUpperCase();
  return `GC-${raw.slice(0, 8)}-${raw.slice(8, 16)}-${raw.slice(16, 24)}`;
}

async function ensureLoyaltyAccount(customerId: string, session?: ClientSession) {
  const query = LoyaltyAccountModel.findOneAndUpdate(
    { customerId: new Types.ObjectId(customerId) },
    { $setOnInsert: { customerId: new Types.ObjectId(customerId) } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  const account = await query;
  if (!account) throw new Error("Loyalty account could not be created.");
  return account;
}

async function ensureStoreCreditAccount(customerId: string, currency: string, session?: ClientSession) {
  const query = StoreCreditAccountModel.findOneAndUpdate(
    { customerId: new Types.ObjectId(customerId) },
    { $setOnInsert: { customerId: new Types.ObjectId(customerId), currency } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  const account = await query;
  if (!account) throw new Error("Store-credit account could not be created.");
  if (account.currency !== currency) {
    throw new ApiError(409, "STORE_CREDIT_CURRENCY_MISMATCH", "Store credit is not available in the checkout currency.");
  }
  return account;
}

function serializeGiftCard(card: {
  _id: Types.ObjectId;
  codeLastFour: string;
  currency: string;
  initialBalanceMinor: number;
  balanceMinor: number;
  status: string;
  expiresAt?: Date | null;
  recipientEmail: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: card._id.toString(),
    codeLastFour: card.codeLastFour,
    currency: card.currency,
    initialBalanceMinor: card.initialBalanceMinor,
    balanceMinor: card.balanceMinor,
    status: card.status,
    expiresAt: card.expiresAt?.toISOString() ?? null,
    recipientEmail: card.recipientEmail,
    note: card.note,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export async function getCustomerValueSummary(customerId: string, currency = "USD") {
  const [loyalty, storeCredit, loyaltyTransactions, storeCreditTransactions] = await Promise.all([
    ensureLoyaltyAccount(customerId),
    ensureStoreCreditAccount(customerId, currency),
    LoyaltyTransactionModel.find({ customerId }).sort({ createdAt: -1 }).limit(30).lean(),
    StoreCreditTransactionModel.find({ customerId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  return {
    policy: CUSTOMER_VALUE_POLICY,
    loyalty: {
      pointsBalance: loyalty.pointsBalance,
      lifetimeEarnedPoints: loyalty.lifetimeEarnedPoints,
      lifetimeRedeemedPoints: loyalty.lifetimeRedeemedPoints,
      transactions: loyaltyTransactions.map((entry) => ({
        id: entry._id.toString(),
        type: entry.type,
        pointsDelta: entry.pointsDelta,
        balanceAfter: entry.balanceAfter,
        note: entry.note,
        orderId: entry.orderId?.toString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    storeCredit: {
      currency: storeCredit.currency,
      balanceMinor: storeCredit.balanceMinor,
      lifetimeCreditedMinor: storeCredit.lifetimeCreditedMinor,
      lifetimeDebitedMinor: storeCredit.lifetimeDebitedMinor,
      transactions: storeCreditTransactions.map((entry) => ({
        id: entry._id.toString(),
        type: entry.type,
        amountDeltaMinor: entry.amountDeltaMinor,
        balanceAfterMinor: entry.balanceAfterMinor,
        note: entry.note,
        orderId: entry.orderId?.toString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
  };
}

export async function quoteValueRedemptions(input: {
  customerId?: string;
  currency: string;
  totalMinor: number;
  requested: ValueRedemptionInput;
}): Promise<ResolvedValueRedemptions> {
  let remaining = Math.max(0, input.totalMinor);
  let loyaltyPoints = 0;
  let loyaltyMinor = 0;
  let storeCreditMinor = 0;
  let giftCardId: string | null = null;
  let giftCardLastFour = "";
  let giftCardMinor = 0;

  if (input.requested.loyaltyPoints > 0 || input.requested.storeCreditMinor > 0) {
    if (!input.customerId) {
      throw new ApiError(401, "CUSTOMER_VALUE_AUTH_REQUIRED", "Sign in to use loyalty points or store credit.");
    }
  }

  if (input.requested.loyaltyPoints > 0 && input.customerId) {
    if (input.requested.loyaltyPoints < CUSTOMER_VALUE_POLICY.minimumLoyaltyRedemptionPoints) {
      throw new ApiError(400, "LOYALTY_MINIMUM_REDEMPTION", `Redeem at least ${CUSTOMER_VALUE_POLICY.minimumLoyaltyRedemptionPoints} points.`);
    }
    const account = await ensureLoyaltyAccount(input.customerId);
    if (account.pointsBalance < input.requested.loyaltyPoints) {
      throw new ApiError(409, "LOYALTY_POINTS_INSUFFICIENT", "Your loyalty-points balance is too low for this redemption.");
    }
    const requestedMinor = input.requested.loyaltyPoints * CUSTOMER_VALUE_POLICY.loyaltyRedemptionMinorPerPoint;
    loyaltyMinor = Math.min(remaining, requestedMinor);
    loyaltyPoints = Math.ceil(loyaltyMinor / CUSTOMER_VALUE_POLICY.loyaltyRedemptionMinorPerPoint);
    remaining -= loyaltyMinor;
  }

  if (input.requested.storeCreditMinor > 0 && input.customerId) {
    const account = await ensureStoreCreditAccount(input.customerId, input.currency);
    if (account.balanceMinor < input.requested.storeCreditMinor) {
      throw new ApiError(409, "STORE_CREDIT_INSUFFICIENT", "Your store-credit balance is too low for this redemption.");
    }
    storeCreditMinor = Math.min(remaining, input.requested.storeCreditMinor);
    remaining -= storeCreditMinor;
  }

  if (input.requested.giftCardCode) {
    const normalized = normalizeGiftCardCode(input.requested.giftCardCode);
    const card = await GiftCardModel.findOne({ codeHash: sha256(normalized) }).select("+codeHash");
    if (!card) throw new ApiError(404, "GIFT_CARD_NOT_FOUND", "Gift card was not found.");
    if (card.expiresAt && card.expiresAt.getTime() <= Date.now()) {
      if (card.status !== "EXPIRED") {
        card.status = "EXPIRED";
        await card.save();
      }
      throw new ApiError(409, "GIFT_CARD_EXPIRED", "This gift card has expired.");
    }
    if (card.status !== "ACTIVE") throw new ApiError(409, "GIFT_CARD_NOT_ACTIVE", "This gift card is not active.");
    if (card.currency !== input.currency) throw new ApiError(409, "GIFT_CARD_CURRENCY_MISMATCH", "Gift-card currency does not match checkout currency.");
    const requestedMinor = input.requested.giftCardMinor > 0 ? input.requested.giftCardMinor : card.balanceMinor;
    if (requestedMinor > card.balanceMinor) throw new ApiError(409, "GIFT_CARD_INSUFFICIENT", "Gift-card balance is too low for the requested amount.");
    giftCardMinor = Math.min(remaining, requestedMinor);
    giftCardId = card.id;
    giftCardLastFour = card.codeLastFour;
  } else if (input.requested.giftCardMinor > 0) {
    throw new ApiError(400, "GIFT_CARD_CODE_REQUIRED", "Enter a gift-card code before applying a gift-card amount.");
  }

  return {
    loyaltyPoints,
    loyaltyMinor,
    storeCreditMinor,
    giftCardId,
    giftCardLastFour,
    giftCardMinor,
    totalMinor: loyaltyMinor + storeCreditMinor + giftCardMinor,
  };
}

export async function applyOrderValueRedemptionsInSession(
  session: ClientSession,
  input: {
    orderId: Types.ObjectId;
    customerId: Types.ObjectId | null;
    currency: string;
    redemptions: ResolvedValueRedemptions;
  },
): Promise<void> {
  const { redemptions } = input;
  if (redemptions.totalMinor <= 0) return;

  if (redemptions.loyaltyPoints > 0) {
    if (!input.customerId) throw new ApiError(401, "CUSTOMER_VALUE_AUTH_REQUIRED", "Customer authentication is required for loyalty redemption.");
    const existing = await LoyaltyTransactionModel.findOne({ idempotencyKey: `order:${input.orderId.toString()}:loyalty:redeem` }).session(session);
    if (!existing) {
      const account = await ensureLoyaltyAccount(input.customerId.toString(), session);
      const updated = await LoyaltyAccountModel.findOneAndUpdate(
        { _id: account._id, pointsBalance: { $gte: redemptions.loyaltyPoints } },
        { $inc: { pointsBalance: -redemptions.loyaltyPoints, lifetimeRedeemedPoints: redemptions.loyaltyPoints } },
        { returnDocument: "after", session },
      );
      if (!updated) throw new ApiError(409, "LOYALTY_POINTS_INSUFFICIENT", "Loyalty points changed before the order could be created.");
      await LoyaltyTransactionModel.create([{
        accountId: updated._id,
        customerId: input.customerId,
        type: "REDEEM",
        pointsDelta: -redemptions.loyaltyPoints,
        balanceAfter: updated.pointsBalance,
        orderId: input.orderId,
        idempotencyKey: `order:${input.orderId.toString()}:loyalty:redeem`,
        note: "Redeemed during checkout.",
      }], { session });
    }
  }

  if (redemptions.storeCreditMinor > 0) {
    if (!input.customerId) throw new ApiError(401, "CUSTOMER_VALUE_AUTH_REQUIRED", "Customer authentication is required for store-credit redemption.");
    const existing = await StoreCreditTransactionModel.findOne({ idempotencyKey: `order:${input.orderId.toString()}:store-credit:redeem` }).session(session);
    if (!existing) {
      const account = await ensureStoreCreditAccount(input.customerId.toString(), input.currency, session);
      const updated = await StoreCreditAccountModel.findOneAndUpdate(
        { _id: account._id, balanceMinor: { $gte: redemptions.storeCreditMinor } },
        { $inc: { balanceMinor: -redemptions.storeCreditMinor, lifetimeDebitedMinor: redemptions.storeCreditMinor } },
        { returnDocument: "after", session },
      );
      if (!updated) throw new ApiError(409, "STORE_CREDIT_INSUFFICIENT", "Store-credit balance changed before the order could be created.");
      await StoreCreditTransactionModel.create([{
        accountId: updated._id,
        customerId: input.customerId,
        type: "REDEEM",
        currency: input.currency,
        amountDeltaMinor: -redemptions.storeCreditMinor,
        balanceAfterMinor: updated.balanceMinor,
        orderId: input.orderId,
        idempotencyKey: `order:${input.orderId.toString()}:store-credit:redeem`,
        note: "Redeemed during checkout.",
      }], { session });
    }
  }

  if (redemptions.giftCardMinor > 0 && redemptions.giftCardId) {
    const existing = await GiftCardTransactionModel.findOne({ idempotencyKey: `order:${input.orderId.toString()}:gift-card:redeem` }).session(session);
    if (!existing) {
      const updated = await GiftCardModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(redemptions.giftCardId),
          status: "ACTIVE",
          currency: input.currency,
          balanceMinor: { $gte: redemptions.giftCardMinor },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        },
        { $inc: { balanceMinor: -redemptions.giftCardMinor } },
        { returnDocument: "after", session },
      );
      if (!updated) throw new ApiError(409, "GIFT_CARD_INSUFFICIENT", "Gift-card balance changed before the order could be created.");
      if (updated.balanceMinor === 0) {
        updated.status = "EXHAUSTED";
        await updated.save({ session });
      }
      await GiftCardTransactionModel.create([{
        giftCardId: updated._id,
        type: "REDEEM",
        currency: input.currency,
        amountDeltaMinor: -redemptions.giftCardMinor,
        balanceAfterMinor: updated.balanceMinor,
        orderId: input.orderId,
        idempotencyKey: `order:${input.orderId.toString()}:gift-card:redeem`,
        note: "Redeemed during checkout.",
      }], { session });
    }
  }
}

export async function reverseOrderValueRedemptionsInSession(
  session: ClientSession,
  input: {
    orderId: Types.ObjectId;
    customerId: Types.ObjectId | null;
    currency: string;
    snapshot?: OrderValueSnapshotLike | null;
    reason: string;
  },
): Promise<void> {
  const snapshot = input.snapshot;
  if (!snapshot || snapshot.redemptionsReversedAt) return;

  const loyaltyPoints = Math.max(0, (snapshot.loyaltyPointsRedeemed ?? 0) - (snapshot.loyaltyPointsRestored ?? 0));
  const storeCreditMinor = Math.max(0, (snapshot.storeCreditMinor ?? 0) - (snapshot.storeCreditRestoredMinor ?? 0));
  const giftCardMinor = Math.max(0, (snapshot.giftCardMinor ?? 0) - (snapshot.giftCardRestoredMinor ?? 0));

  if (loyaltyPoints > 0 && input.customerId) {
    const account = await ensureLoyaltyAccount(input.customerId.toString(), session);
    const key = `order:${input.orderId.toString()}:loyalty:redeem-reversal`;
    const existing = await LoyaltyTransactionModel.findOne({ idempotencyKey: key }).session(session);
    if (!existing) {
      account.pointsBalance += loyaltyPoints;
      account.lifetimeRedeemedPoints = Math.max(0, account.lifetimeRedeemedPoints - loyaltyPoints);
      await account.save({ session });
      await LoyaltyTransactionModel.create([{
        accountId: account._id,
        customerId: input.customerId,
        type: "REDEMPTION_REVERSAL",
        pointsDelta: loyaltyPoints,
        balanceAfter: account.pointsBalance,
        orderId: input.orderId,
        idempotencyKey: key,
        note: input.reason,
      }], { session });
    }
  }

  if (storeCreditMinor > 0 && input.customerId) {
    const account = await ensureStoreCreditAccount(input.customerId.toString(), input.currency, session);
    const key = `order:${input.orderId.toString()}:store-credit:redeem-reversal`;
    const existing = await StoreCreditTransactionModel.findOne({ idempotencyKey: key }).session(session);
    if (!existing) {
      account.balanceMinor += storeCreditMinor;
      account.lifetimeDebitedMinor = Math.max(0, account.lifetimeDebitedMinor - storeCreditMinor);
      await account.save({ session });
      await StoreCreditTransactionModel.create([{
        accountId: account._id,
        customerId: input.customerId,
        type: "REDEMPTION_REVERSAL",
        currency: input.currency,
        amountDeltaMinor: storeCreditMinor,
        balanceAfterMinor: account.balanceMinor,
        orderId: input.orderId,
        idempotencyKey: key,
        note: input.reason,
      }], { session });
    }
  }

  if (giftCardMinor > 0 && snapshot.giftCardId) {
    const key = `order:${input.orderId.toString()}:gift-card:redeem-reversal`;
    const existing = await GiftCardTransactionModel.findOne({ idempotencyKey: key }).session(session);
    if (!existing) {
      const card = await GiftCardModel.findById(snapshot.giftCardId).session(session);
      if (card) {
        card.balanceMinor += giftCardMinor;
        if (card.status === "EXHAUSTED") card.status = "ACTIVE";
        await card.save({ session });
        await GiftCardTransactionModel.create([{
          giftCardId: card._id,
          type: "REDEMPTION_REVERSAL",
          currency: input.currency,
          amountDeltaMinor: giftCardMinor,
          balanceAfterMinor: card.balanceMinor,
          orderId: input.orderId,
          idempotencyKey: key,
          note: input.reason,
        }], { session });
      }
    }
  }
}

export async function awardLoyaltyForOrderInSession(
  session: ClientSession,
  input: {
    orderId: Types.ObjectId;
    customerId: Types.ObjectId | null;
    eligibleMinor: number;
  },
): Promise<number> {
  if (!input.customerId) return 0;
  const points = Math.floor(Math.max(0, input.eligibleMinor) / 100) * CUSTOMER_VALUE_POLICY.loyaltyEarnPointsPerCurrencyUnit;
  if (points <= 0) return 0;
  const key = `order:${input.orderId.toString()}:loyalty:earn`;
  const existing = await LoyaltyTransactionModel.findOne({ idempotencyKey: key }).session(session);
  if (existing) return Math.max(0, existing.pointsDelta);

  const account = await ensureLoyaltyAccount(input.customerId.toString(), session);
  account.pointsBalance += points;
  account.lifetimeEarnedPoints += points;
  await account.save({ session });
  await LoyaltyTransactionModel.create([{
    accountId: account._id,
    customerId: input.customerId,
    type: "EARN",
    pointsDelta: points,
    balanceAfter: account.pointsBalance,
    orderId: input.orderId,
    idempotencyKey: key,
    note: "Earned from a successfully paid order.",
  }], { session });
  return points;
}

export async function reverseLoyaltyEarnForOrderInSession(
  session: ClientSession,
  input: {
    orderId: Types.ObjectId;
    customerId: Types.ObjectId | null;
    points: number;
    reason: string;
  },
): Promise<void> {
  if (!input.customerId || input.points <= 0) return;
  const key = `order:${input.orderId.toString()}:loyalty:earn-refund-reversal`;
  const existing = await LoyaltyTransactionModel.findOne({ idempotencyKey: key }).session(session);
  if (existing) return;
  const account = await ensureLoyaltyAccount(input.customerId.toString(), session);
  const pointsToReverse = Math.min(account.pointsBalance, input.points);
  account.pointsBalance -= pointsToReverse;
  account.lifetimeEarnedPoints = Math.max(0, account.lifetimeEarnedPoints - input.points);
  await account.save({ session });
  await LoyaltyTransactionModel.create([{
    accountId: account._id,
    customerId: input.customerId,
    type: "REFUND_REVERSAL",
    pointsDelta: -pointsToReverse,
    balanceAfter: account.pointsBalance,
    orderId: input.orderId,
    idempotencyKey: key,
    note: input.reason,
  }], { session });
}

export async function reconcileOrderValueRedemptionsForFulfillment(orderId: string): Promise<void> {
  const { OrderModel } = await import("../orders/order.model.js");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order?.customerValueSnapshot || order.customerValueSnapshot.fulfillmentReconciledAt) return;
      const fulfillment = order.fulfillmentPricing ?? order.pricing;
      const grossMinor = Math.max(
        0,
        fulfillment.subtotalMinor - fulfillment.discountMinor + fulfillment.taxMinor + fulfillment.deliveryFeeMinor,
      );
      const originalPrepaidMinor = order.pricing.prepaidAmountMinor ?? 0;
      const allowedPrepaidMinor = Math.min(originalPrepaidMinor, grossMinor);
      let excessMinor = Math.max(0, originalPrepaidMinor - allowedPrepaidMinor);
      const snapshot = order.customerValueSnapshot;

      const giftRestore = Math.min(excessMinor, snapshot.giftCardMinor ?? 0);
      excessMinor -= giftRestore;
      const storeCreditRestore = Math.min(excessMinor, snapshot.storeCreditMinor ?? 0);
      excessMinor -= storeCreditRestore;
      const loyaltyMinorAvailable = snapshot.loyaltyMinor ?? 0;
      const loyaltyRestoreMinor = Math.min(excessMinor, loyaltyMinorAvailable);
      const loyaltyRestorePoints = Math.min(
        snapshot.loyaltyPointsRedeemed ?? 0,
        Math.ceil(loyaltyRestoreMinor / CUSTOMER_VALUE_POLICY.loyaltyRedemptionMinorPerPoint),
      );

      if (giftRestore > 0 && snapshot.giftCardId) {
        const key = `order:${order._id.toString()}:gift-card:fulfillment-restore`;
        const existing = await GiftCardTransactionModel.findOne({ idempotencyKey: key }).session(session);
        if (!existing) {
          const card = await GiftCardModel.findById(snapshot.giftCardId).session(session);
          if (card) {
            card.balanceMinor += giftRestore;
            if (card.status === "EXHAUSTED") card.status = "ACTIVE";
            await card.save({ session });
            await GiftCardTransactionModel.create([{
              giftCardId: card._id,
              type: "REDEMPTION_REVERSAL",
              currency: order.pricing.currency,
              amountDeltaMinor: giftRestore,
              balanceAfterMinor: card.balanceMinor,
              orderId: order._id,
              idempotencyKey: key,
              note: "Unused gift-card value restored after final fulfillment pricing.",
            }], { session });
          }
        }
      }

      if (storeCreditRestore > 0 && order.customerId) {
        const key = `order:${order._id.toString()}:store-credit:fulfillment-restore`;
        const existing = await StoreCreditTransactionModel.findOne({ idempotencyKey: key }).session(session);
        if (!existing) {
          const account = await ensureStoreCreditAccount(order.customerId.toString(), order.pricing.currency, session);
          account.balanceMinor += storeCreditRestore;
          account.lifetimeDebitedMinor = Math.max(0, account.lifetimeDebitedMinor - storeCreditRestore);
          await account.save({ session });
          await StoreCreditTransactionModel.create([{
            accountId: account._id,
            customerId: order.customerId,
            type: "REDEMPTION_REVERSAL",
            currency: order.pricing.currency,
            amountDeltaMinor: storeCreditRestore,
            balanceAfterMinor: account.balanceMinor,
            orderId: order._id,
            idempotencyKey: key,
            note: "Unused store credit restored after final fulfillment pricing.",
          }], { session });
        }
      }

      if (loyaltyRestorePoints > 0 && order.customerId) {
        const key = `order:${order._id.toString()}:loyalty:fulfillment-restore`;
        const existing = await LoyaltyTransactionModel.findOne({ idempotencyKey: key }).session(session);
        if (!existing) {
          const account = await ensureLoyaltyAccount(order.customerId.toString(), session);
          account.pointsBalance += loyaltyRestorePoints;
          account.lifetimeRedeemedPoints = Math.max(0, account.lifetimeRedeemedPoints - loyaltyRestorePoints);
          await account.save({ session });
          await LoyaltyTransactionModel.create([{
            accountId: account._id,
            customerId: order.customerId,
            type: "REDEMPTION_REVERSAL",
            pointsDelta: loyaltyRestorePoints,
            balanceAfter: account.pointsBalance,
            orderId: order._id,
            idempotencyKey: key,
            note: "Unused loyalty points restored after final fulfillment pricing.",
          }], { session });
        }
      }

      const restoredMinor = giftRestore + storeCreditRestore + loyaltyRestoreMinor;
      snapshot.giftCardRestoredMinor = giftRestore;
      snapshot.storeCreditRestoredMinor = storeCreditRestore;
      snapshot.loyaltyPointsRestored = loyaltyRestorePoints;
      snapshot.fulfillmentRestoredMinor = restoredMinor;
      snapshot.fulfillmentReconciledAt = new Date();
      const finalPrepaidMinor = Math.max(0, originalPrepaidMinor - restoredMinor);
      order.fulfillmentPricing = {
        currency: fulfillment.currency,
        subtotalMinor: fulfillment.subtotalMinor,
        discountMinor: fulfillment.discountMinor,
        taxMinor: fulfillment.taxMinor,
        deliveryFeeMinor: fulfillment.deliveryFeeMinor,
        prepaidAmountMinor: finalPrepaidMinor,
        totalMinor: Math.max(0, grossMinor - finalPrepaidMinor),
      };
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

export async function adminListCustomerValue(query: AdminListQuery) {
  const customerFilter: Record<string, unknown> = {};
  if (query.search) {
    customerFilter.$or = [
      { email: { $regex: query.search, $options: "i" } },
      { firstName: { $regex: query.search, $options: "i" } },
      { lastName: { $regex: query.search, $options: "i" } },
    ];
  }
  const customers = await CustomerModel.find(customerFilter)
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
  const customerIds = customers.map((customer) => customer._id);
  const [total, loyaltyAccounts, storeCreditAccounts] = await Promise.all([
    CustomerModel.countDocuments(customerFilter),
    LoyaltyAccountModel.find({ customerId: { $in: customerIds } }).lean(),
    StoreCreditAccountModel.find({ customerId: { $in: customerIds } }).lean(),
  ]);
  const loyaltyMap = new Map(loyaltyAccounts.map((entry) => [entry.customerId.toString(), entry]));
  const creditMap = new Map(storeCreditAccounts.map((entry) => [entry.customerId.toString(), entry]));
  return {
    items: customers.map((customer) => {
      const loyalty = loyaltyMap.get(customer._id.toString());
      const credit = creditMap.get(customer._id.toString());
      return {
        customerId: customer._id.toString(),
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        loyaltyPoints: loyalty?.pointsBalance ?? 0,
        storeCreditMinor: credit?.balanceMinor ?? 0,
        currency: credit?.currency ?? "USD",
      };
    }),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function adjustLoyalty(input: LoyaltyAdjustmentInput, adminUserId: string) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const customer = await CustomerModel.findById(input.customerId).session(session);
      if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer was not found.");
      const account = await ensureLoyaltyAccount(input.customerId, session);
      if (account.pointsBalance + input.pointsDelta < 0) throw new ApiError(409, "LOYALTY_POINTS_INSUFFICIENT", "Adjustment would make the loyalty balance negative.");
      account.pointsBalance += input.pointsDelta;
      if (input.pointsDelta > 0) account.lifetimeEarnedPoints += input.pointsDelta;
      await account.save({ session });
      await LoyaltyTransactionModel.create([{
        accountId: account._id,
        customerId: customer._id,
        type: "ADJUSTMENT",
        pointsDelta: input.pointsDelta,
        balanceAfter: account.pointsBalance,
        idempotencyKey: `admin:${adminUserId}:loyalty:${new Types.ObjectId().toString()}`,
        note: input.note,
        createdByAdminId: new Types.ObjectId(adminUserId),
      }], { session });
      return { customerId: customer.id, pointsBalance: account.pointsBalance };
    });
  } finally {
    await session.endSession();
  }
}

export async function adjustStoreCredit(input: StoreCreditAdjustmentInput, adminUserId: string) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const customer = await CustomerModel.findById(input.customerId).session(session);
      if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer was not found.");
      const account = await ensureStoreCreditAccount(input.customerId, input.currency, session);
      if (account.balanceMinor + input.amountDeltaMinor < 0) throw new ApiError(409, "STORE_CREDIT_INSUFFICIENT", "Adjustment would make the store-credit balance negative.");
      account.balanceMinor += input.amountDeltaMinor;
      if (input.amountDeltaMinor > 0) account.lifetimeCreditedMinor += input.amountDeltaMinor;
      else account.lifetimeDebitedMinor += Math.abs(input.amountDeltaMinor);
      await account.save({ session });
      await StoreCreditTransactionModel.create([{
        accountId: account._id,
        customerId: customer._id,
        type: "ADJUSTMENT",
        currency: account.currency,
        amountDeltaMinor: input.amountDeltaMinor,
        balanceAfterMinor: account.balanceMinor,
        idempotencyKey: `admin:${adminUserId}:store-credit:${new Types.ObjectId().toString()}`,
        note: input.note,
        createdByAdminId: new Types.ObjectId(adminUserId),
      }], { session });
      return { customerId: customer.id, currency: account.currency, balanceMinor: account.balanceMinor };
    });
  } finally {
    await session.endSession();
  }
}

export async function createGiftCard(input: GiftCardCreateInput, adminUserId: string) {
  let code = "";
  let card = null;
  for (let attempt = 0; attempt < 5 && !card; attempt += 1) {
    code = generateGiftCardCode();
    const normalized = normalizeGiftCardCode(code);
    try {
      card = await GiftCardModel.create({
        codeHash: sha256(normalized),
        codeLastFour: normalized.slice(-4),
        currency: input.currency,
        initialBalanceMinor: input.initialBalanceMinor,
        balanceMinor: input.initialBalanceMinor,
        status: "ACTIVE",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        recipientEmail: input.recipientEmail,
        note: input.note,
        issuedByAdminId: new Types.ObjectId(adminUserId),
      });
    } catch (error: unknown) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
    }
  }
  if (!card) throw new Error("Could not generate a unique gift-card code.");
  await GiftCardTransactionModel.create({
    giftCardId: card._id,
    type: "ISSUE",
    currency: card.currency,
    amountDeltaMinor: card.initialBalanceMinor,
    balanceAfterMinor: card.balanceMinor,
    idempotencyKey: `gift-card:${card.id}:issue`,
    note: input.note || "Gift card issued.",
    createdByAdminId: new Types.ObjectId(adminUserId),
  });
  return { giftCard: serializeGiftCard(card), code };
}

export async function listGiftCards(query: AdminListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    filter.$or = [
      { codeLastFour: { $regex: query.search.replace(/[^a-z0-9]/gi, "").slice(-4), $options: "i" } },
      { recipientEmail: { $regex: query.search, $options: "i" } },
    ];
  }
  const [cards, total] = await Promise.all([
    GiftCardModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit),
    GiftCardModel.countDocuments(filter),
  ]);
  return { items: cards.map(serializeGiftCard), pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) } };
}

export async function adjustGiftCard(giftCardId: string, amountDeltaMinor: number, note: string, adminUserId: string) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const card = await GiftCardModel.findById(giftCardId).session(session);
      if (!card) throw new ApiError(404, "GIFT_CARD_NOT_FOUND", "Gift card was not found.");
      if (card.balanceMinor + amountDeltaMinor < 0) throw new ApiError(409, "GIFT_CARD_INSUFFICIENT", "Adjustment would make the gift-card balance negative.");
      card.balanceMinor += amountDeltaMinor;
      if (card.balanceMinor === 0) card.status = "EXHAUSTED";
      else if (card.status === "EXHAUSTED") card.status = "ACTIVE";
      await card.save({ session });
      await GiftCardTransactionModel.create([{
        giftCardId: card._id,
        type: "ADJUSTMENT",
        currency: card.currency,
        amountDeltaMinor,
        balanceAfterMinor: card.balanceMinor,
        idempotencyKey: `admin:${adminUserId}:gift-card:${new Types.ObjectId().toString()}`,
        note,
        createdByAdminId: new Types.ObjectId(adminUserId),
      }], { session });
      return serializeGiftCard(card);
    });
  } finally {
    await session.endSession();
  }
}

export async function updateGiftCardStatus(giftCardId: string, status: "ACTIVE" | "DISABLED") {
  const card = await GiftCardModel.findById(giftCardId);
  if (!card) throw new ApiError(404, "GIFT_CARD_NOT_FOUND", "Gift card was not found.");
  if (card.balanceMinor === 0 && status === "ACTIVE") throw new ApiError(409, "GIFT_CARD_EMPTY", "An empty gift card cannot be activated.");
  if (card.expiresAt && card.expiresAt.getTime() <= Date.now() && status === "ACTIVE") throw new ApiError(409, "GIFT_CARD_EXPIRED", "An expired gift card cannot be activated.");
  card.status = status;
  await card.save();
  return serializeGiftCard(card);
}

export async function checkGiftCard(code: string) {
  const normalized = normalizeGiftCardCode(code);
  const card = await GiftCardModel.findOne({ codeHash: sha256(normalized) }).select("+codeHash");
  if (!card) throw new ApiError(404, "GIFT_CARD_NOT_FOUND", "Gift card was not found.");
  if (card.expiresAt && card.expiresAt.getTime() <= Date.now()) {
    if (card.status !== "EXPIRED") {
      card.status = "EXPIRED";
      await card.save();
    }
  }
  return { codeLastFour: card.codeLastFour, currency: card.currency, balanceMinor: card.balanceMinor, status: card.status, expiresAt: card.expiresAt?.toISOString() ?? null };
}

export async function subscribeBackInStock(input: BackInStockInput, customerId?: string) {
  const [store, product, inventory, customer] = await Promise.all([
    StoreLocationModel.findOne({ _id: input.storeId, status: "ACTIVE" }).lean(),
    ProductModel.findOne({ _id: input.productId, isActive: true, archivedAt: null }).lean(),
    InventoryModel.findOne({ storeId: input.storeId, productId: input.productId, variantId: input.variantId }).lean(),
    customerId ? CustomerModel.findById(customerId).lean() : null,
  ]);
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store was not found.");
  const variant = product?.variants.find((entry) => entry._id.toString() === input.variantId && entry.status === "ACTIVE");
  if (!product || !variant) throw new ApiError(404, "PRODUCT_VARIANT_NOT_FOUND", "Product variant was not found.");
  if ((inventory?.quantityAvailable ?? 0) > 0) throw new ApiError(409, "PRODUCT_ALREADY_IN_STOCK", "This product is already in stock.");
  const email = (input.email ?? customer?.email ?? "").trim().toLowerCase();
  if (!email) throw new ApiError(400, "BACK_IN_STOCK_EMAIL_REQUIRED", "Enter an email address for the back-in-stock alert.");

  const existing = await BackInStockSubscriptionModel.findOne({ email, storeId: input.storeId, productId: input.productId, variantId: input.variantId, status: "ACTIVE" });
  if (existing) return { id: existing.id, status: existing.status, email: existing.email };
  const token = createOpaqueToken();
  const subscription = await BackInStockSubscriptionModel.create({
    customerId: customerId ? new Types.ObjectId(customerId) : null,
    email,
    storeId: new Types.ObjectId(input.storeId),
    productId: new Types.ObjectId(input.productId),
    variantId: new Types.ObjectId(input.variantId),
    status: "ACTIVE",
    cancelTokenHash: sha256(token),
    cancelTokenLastFour: token.slice(-4),
  });
  return { id: subscription.id, status: subscription.status, email: subscription.email, cancelToken: token };
}

export async function cancelBackInStock(subscriptionId: string, token: string) {
  const subscription = await BackInStockSubscriptionModel.findById(subscriptionId).select("+cancelTokenHash");
  if (!subscription || sha256(token) !== subscription.cancelTokenHash) throw new ApiError(404, "BACK_IN_STOCK_SUBSCRIPTION_NOT_FOUND", "Back-in-stock subscription was not found.");
  subscription.status = "CANCELLED";
  await subscription.save();
  return { id: subscription.id, status: subscription.status };
}

export async function listBackInStockSubscriptions(query: BackInStockAdminQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.email = { $regex: query.search, $options: "i" };
  const [items, total] = await Promise.all([
    BackInStockSubscriptionModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    BackInStockSubscriptionModel.countDocuments(filter),
  ]);
  return {
    items: items.map((entry) => ({ id: entry._id.toString(), email: entry.email, storeId: entry.storeId.toString(), productId: entry.productId.toString(), variantId: entry.variantId.toString(), status: entry.status, notifiedAt: entry.notifiedAt?.toISOString() ?? null, createdAt: entry.createdAt.toISOString() })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function dispatchBackInStockAlerts(limit = 100) {
  const subscriptions = await BackInStockSubscriptionModel.find({ status: "ACTIVE" }).sort({ createdAt: 1 }).limit(limit);
  let notified = 0;
  let skipped = 0;
  for (const subscription of subscriptions) {
    const [inventory, product, store] = await Promise.all([
      InventoryModel.findOne({ storeId: subscription.storeId, productId: subscription.productId, variantId: subscription.variantId }).lean(),
      ProductModel.findById(subscription.productId).lean(),
      StoreLocationModel.findById(subscription.storeId).lean(),
    ]);
    if ((inventory?.quantityAvailable ?? 0) <= 0 || !product || !store) {
      skipped += 1;
      continue;
    }
    const variant = product.variants.find((entry) => entry._id.toString() === subscription.variantId.toString());
    if (!variant) {
      skipped += 1;
      continue;
    }
    const productUrl = `${env.CUSTOMER_APP_URL.replace(/\/$/, "")}/products/${product.slug}`;
    try {
      await sendEmail(
        subscription.email,
        `${product.name} is back in stock`,
        `Good news — ${product.name} (${variant.sku}) is available again at ${store.name}.\n\nShop now: ${productUrl}\n\nThis alert was sent because you requested a back-in-stock notification.`,
      );
      subscription.status = "NOTIFIED";
      subscription.notifiedAt = new Date();
      await subscription.save();
      notified += 1;
    } catch {
      skipped += 1;
    }
  }
  return { scanned: subscriptions.length, notified, skipped };
}