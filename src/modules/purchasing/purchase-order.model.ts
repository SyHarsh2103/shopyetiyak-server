import { model, Schema, type InferSchemaType } from "mongoose";

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
  "CLOSED",
] as const;

const purchaseOrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  productNameSnapshot: { type: String, required: true, trim: true, maxlength: 180 },
  skuSnapshot: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  supplierSkuSnapshot: { type: String, trim: true, uppercase: true, maxlength: 100, default: "" },
  orderedQuantity: { type: Number, required: true, min: 0.001 },
  receivedQuantity: { type: Number, required: true, min: 0, default: 0 },
  unitCostMinor: { type: Number, required: true, min: 0 },
  lineTotalMinor: { type: Number, required: true, min: 0 },
}, { _id: true });

const purchaseOrderSchema = new Schema({
  purchaseOrderNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  status: { type: String, required: true, enum: PURCHASE_ORDER_STATUSES, default: "DRAFT", index: true },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
  items: { type: [purchaseOrderItemSchema], required: true, validate: [(value: unknown[]) => value.length > 0, "Purchase order requires at least one item."] },
  subtotalMinor: { type: Number, required: true, min: 0, default: 0 },
  expectedDeliveryDate: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  approvedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  approvedAt: { type: Date, default: null },
  sentByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  sentAt: { type: Date, default: null },
  cancelledByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  cancelledAt: { type: Date, default: null },
  closedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

purchaseOrderSchema.index({ purchaseOrderNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ storeId: 1, status: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

export type PurchaseOrder = InferSchemaType<typeof purchaseOrderSchema>;
export const PurchaseOrderModel = model("PurchaseOrder", purchaseOrderSchema, "purchaseOrders");
