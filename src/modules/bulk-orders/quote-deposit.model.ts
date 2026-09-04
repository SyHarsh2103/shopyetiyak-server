import { model, Schema, type InferSchemaType } from "mongoose";

export const QUOTE_DEPOSIT_PAYMENT_STATUSES = [
  "PENDING",
  "REQUIRES_ACTION",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

const quoteDepositSchema = new Schema(
  {
    quoteId: { type: Schema.Types.ObjectId, ref: "Quote", required: true, index: true },
    provider: { type: String, required: true, enum: ["STRIPE"], default: "STRIPE" },
    providerPaymentIntentId: { type: String, trim: true, default: undefined },
    idempotencyKeyHash: { type: String, required: true, trim: true, unique: true },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
    amountMinor: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: QUOTE_DEPOSIT_PAYMENT_STATUSES, default: "PENDING", index: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    lastError: {
      type: new Schema(
        {
          code: { type: String, default: "", trim: true, maxlength: 120 },
          message: { type: String, default: "", trim: true, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

quoteDepositSchema.index(
  { providerPaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerPaymentIntentId: { $type: "string" } },
  },
);
quoteDepositSchema.index({ quoteId: 1, createdAt: -1 });

export type QuoteDepositPayment = InferSchemaType<typeof quoteDepositSchema>;
export const QuoteDepositPaymentModel = model(
  "QuoteDepositPayment",
  quoteDepositSchema,
  "quoteDepositPayments",
);
