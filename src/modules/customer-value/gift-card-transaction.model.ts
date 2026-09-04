import { model, Schema, type InferSchemaType } from "mongoose";

export const GIFT_CARD_TRANSACTION_TYPES = [
  "ISSUE",
  "REDEEM",
  "ADJUSTMENT",
  "REFUND",
  "REDEMPTION_REVERSAL",
] as const;

const giftCardTransactionSchema = new Schema(
  {
    giftCardId: { type: Schema.Types.ObjectId, ref: "GiftCard", required: true, index: true },
    type: { type: String, enum: GIFT_CARD_TRANSACTION_TYPES, required: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
    amountDeltaMinor: { type: Number, required: true },
    balanceAfterMinor: { type: Number, required: true, min: 0 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    refundId: { type: Schema.Types.ObjectId, ref: "Refund", default: null, index: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 180, unique: true, index: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

giftCardTransactionSchema.index({ giftCardId: 1, createdAt: -1 });
giftCardTransactionSchema.index({ orderId: 1, type: 1 });

export type GiftCardTransaction = InferSchemaType<typeof giftCardTransactionSchema>;
export const GiftCardTransactionModel = model("GiftCardTransaction", giftCardTransactionSchema, "giftCardTransactions");
