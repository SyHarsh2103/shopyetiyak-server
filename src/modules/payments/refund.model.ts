import { model, Schema, type InferSchemaType } from "mongoose";

export const REFUND_STATUSES = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

const refundSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    requestedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
      index: true,
    },
    providerRefundId: {
      type: String,
      trim: true,
      default: undefined,
    },
    idempotencyKeyHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      required: true,
      enum: REFUND_STATUSES,
      default: "PENDING",
      index: true,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true, versionKey: false },
);

refundSchema.index(
  { providerRefundId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerRefundId: { $type: "string" },
    },
  },
);
refundSchema.index({ paymentId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

export type Refund = InferSchemaType<typeof refundSchema>;
export const RefundModel = model("Refund", refundSchema, "refunds");
