import { model, Schema, type InferSchemaType } from "mongoose";

export const BACK_IN_STOCK_STATUSES = ["ACTIVE", "NOTIFIED", "CANCELLED"] as const;

const backInStockSubscriptionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: BACK_IN_STOCK_STATUSES, required: true, default: "ACTIVE", index: true },
    notifiedAt: { type: Date, default: null },
    cancelTokenHash: { type: String, required: true, select: false, trim: true, minlength: 64, maxlength: 64 },
    cancelTokenLastFour: { type: String, required: true, trim: true, minlength: 4, maxlength: 4 },
  },
  { timestamps: true, versionKey: false },
);

backInStockSubscriptionSchema.index({ storeId: 1, productId: 1, variantId: 1, status: 1 });
backInStockSubscriptionSchema.index(
  { email: 1, storeId: 1, productId: 1, variantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

export type BackInStockSubscription = InferSchemaType<typeof backInStockSubscriptionSchema>;
export const BackInStockSubscriptionModel = model(
  "BackInStockSubscription",
  backInStockSubscriptionSchema,
  "backInStockSubscriptions",
);
