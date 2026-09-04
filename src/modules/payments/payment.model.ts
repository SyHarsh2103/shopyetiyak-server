import { model, Schema, type InferSchemaType } from "mongoose";

export const PAYMENT_STATUSES = [
  "PENDING",
  "REQUIRES_ACTION",
  "AUTHORIZED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export const PAYMENT_CAPTURE_METHODS = ["AUTOMATIC", "MANUAL"] as const;

const paymentErrorSchema = new Schema(
  {
    code: { type: String, trim: true, maxlength: 120, default: "" },
    message: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    guestTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    cartId: {
      type: Schema.Types.ObjectId,
      ref: "Cart",
      default: null,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "StoreLocation",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["STRIPE", "INTERNAL"],
      default: "STRIPE",
    },
    providerPaymentIntentId: {
      type: String,
      trim: true,
      default: undefined,
    },
    checkoutFingerprint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
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
      min: 0,
    },
    authorizedAmountMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    capturedAmountMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    refundedAmountMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    captureMethod: {
      type: String,
      required: true,
      enum: PAYMENT_CAPTURE_METHODS,
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
      index: true,
    },
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    fulfillmentType: {
      type: String,
      required: true,
      enum: ["DELIVERY", "PICKUP"],
    },
    lastError: {
      type: paymentErrorSchema,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

paymentSchema.index(
  { providerPaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerPaymentIntentId: { $type: "string" },
    },
  },
);
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ guestTokenHash: 1, createdAt: -1 });
paymentSchema.index({ storeId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ checkoutFingerprint: 1, createdAt: -1 });

paymentSchema.index({ storeId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model("Payment", paymentSchema, "payments");
