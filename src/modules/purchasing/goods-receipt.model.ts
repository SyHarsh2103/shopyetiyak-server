import { model, Schema, type InferSchemaType } from "mongoose";

const goodsReceiptItemSchema = new Schema({
  purchaseOrderItemId: { type: Schema.Types.ObjectId, required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  skuSnapshot: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
  quantityReceived: { type: Number, required: true, min: 0.001 },
  damagedQuantity: { type: Number, required: true, min: 0, default: 0 },
  acceptedQuantity: { type: Number, required: true, min: 0, default: 0 },
  unitCostMinor: { type: Number, required: true, min: 0 },
  acceptedCostMinor: { type: Number, required: true, min: 0 },
  manufacturingDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  inventoryBatchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch", default: null },
}, { _id: true });

const goodsReceiptSchema = new Schema({
  receiptNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
  items: { type: [goodsReceiptItemSchema], required: true },
  totalAcceptedCostMinor: { type: Number, required: true, min: 0, default: 0 },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  receivedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  receivedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, versionKey: false });

goodsReceiptSchema.index({ receiptNumber: 1 }, { unique: true });
goodsReceiptSchema.index({ purchaseOrderId: 1, receivedAt: -1 });
goodsReceiptSchema.index({ supplierId: 1, receivedAt: -1 });
goodsReceiptSchema.index({ storeId: 1, receivedAt: -1 });

export type GoodsReceipt = InferSchemaType<typeof goodsReceiptSchema>;
export const GoodsReceiptModel = model("GoodsReceipt", goodsReceiptSchema, "goodsReceipts");
