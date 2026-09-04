import { model, Schema, type InferSchemaType } from "mongoose";

import { ORDER_STATUSES } from "./order.model.js";

const orderStatusHistorySchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    fromStatus: { type: String, enum: ORDER_STATUSES, default: null },
    toStatus: { type: String, required: true, enum: ORDER_STATUSES },
    actorType: { type: String, required: true, enum: ["ADMIN", "CUSTOMER", "SYSTEM", "STRIPE"] },
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorRoleNames: { type: [String], default: [] },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

orderStatusHistorySchema.index({ orderId: 1, createdAt: 1 });
orderStatusHistorySchema.index({ orderNumber: 1, createdAt: 1 });

export type OrderStatusHistory = InferSchemaType<typeof orderStatusHistorySchema>;
export const OrderStatusHistoryModel = model(
  "OrderStatusHistory",
  orderStatusHistorySchema,
  "orderStatusHistories",
);
