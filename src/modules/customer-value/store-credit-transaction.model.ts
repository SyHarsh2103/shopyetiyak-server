import { model, Schema, type InferSchemaType } from "mongoose";

export const STORE_CREDIT_TRANSACTION_TYPES = [
  "CREDIT",
  "REDEEM",
  "ADJUSTMENT",
  "REFUND",
  "REDEMPTION_REVERSAL",
] as const;

const storeCreditTransactionSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "StoreCreditAccount", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: { type: String, enum: STORE_CREDIT_TRANSACTION_TYPES, required: true, index: true },
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

storeCreditTransactionSchema.index({ customerId: 1, createdAt: -1 });
storeCreditTransactionSchema.index({ orderId: 1, type: 1 });

export type StoreCreditTransaction = InferSchemaType<typeof storeCreditTransactionSchema>;
export const StoreCreditTransactionModel = model("StoreCreditTransaction", storeCreditTransactionSchema, "storeCreditTransactions");
