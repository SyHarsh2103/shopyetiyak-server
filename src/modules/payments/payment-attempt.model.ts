import { model, Schema, type InferSchemaType } from "mongoose";

export const PAYMENT_ATTEMPT_OPERATIONS = [
  "CREATE_INTENT",
  "CAPTURE",
  "CANCEL",
  "REFUND",
] as const;

export const PAYMENT_ATTEMPT_STATUSES = [
  "STARTED",
  "SUCCEEDED",
  "FAILED",
] as const;

const paymentAttemptSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    operation: {
      type: String,
      required: true,
      enum: PAYMENT_ATTEMPT_OPERATIONS,
      index: true,
    },
    idempotencyKeyHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      unique: true,
      index: true,
    },
    providerObjectId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    requestedAmountMinor: {
      type: Number,
      min: 0,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_ATTEMPT_STATUSES,
      default: "STARTED",
      index: true,
    },
    errorCode: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true, versionKey: false },
);

paymentAttemptSchema.index({ paymentId: 1, createdAt: -1 });

export type PaymentAttempt = InferSchemaType<typeof paymentAttemptSchema>;
export const PaymentAttemptModel = model(
  "PaymentAttempt",
  paymentAttemptSchema,
  "paymentAttempts",
);
