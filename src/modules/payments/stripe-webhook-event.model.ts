import { model, Schema, type InferSchemaType } from "mongoose";

export const STRIPE_WEBHOOK_PROCESSING_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED",
] as const;

const stripeWebhookEventSchema = new Schema(
  {
    providerEventId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
      index: true,
    },
    apiVersion: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    livemode: {
      type: Boolean,
      required: true,
      default: false,
    },
    providerCreatedAt: {
      type: Date,
      required: true,
    },
    paymentIntentId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    processingStatus: {
      type: String,
      required: true,
      enum: STRIPE_WEBHOOK_PROCESSING_STATUSES,
      default: "RECEIVED",
      index: true,
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

stripeWebhookEventSchema.index({ processingStatus: 1, createdAt: -1 });
stripeWebhookEventSchema.index({ paymentIntentId: 1, createdAt: -1 });

export type StripeWebhookEvent = InferSchemaType<typeof stripeWebhookEventSchema>;
export const StripeWebhookEventModel = model(
  "StripeWebhookEvent",
  stripeWebhookEventSchema,
  "stripeWebhookEvents",
);
