import { model, Schema, type InferSchemaType } from "mongoose";

export const LOYALTY_TRANSACTION_TYPES = [
  "EARN",
  "REDEEM",
  "ADJUSTMENT",
  "EXPIRATION",
  "REFUND_REVERSAL",
  "REDEMPTION_REVERSAL",
] as const;

const loyaltyTransactionSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "LoyaltyAccount", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: { type: String, enum: LOYALTY_TRANSACTION_TYPES, required: true, index: true },
    pointsDelta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    refundId: { type: Schema.Types.ObjectId, ref: "Refund", default: null, index: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 180, unique: true, index: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

loyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ orderId: 1, type: 1 });

export type LoyaltyTransaction = InferSchemaType<typeof loyaltyTransactionSchema>;
export const LoyaltyTransactionModel = model("LoyaltyTransaction", loyaltyTransactionSchema, "loyaltyTransactions");
