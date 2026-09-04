import { model, Schema, type InferSchemaType } from "mongoose";

const supplierReturnItemSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
  quantity: { type: Number, required: true, min: 0.001 },
  unitCostMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
  lineValueMinor: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
}, { _id: true });

const supplierReturnSchema = new Schema({
  returnNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
  purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },
  goodsReceiptId: { type: Schema.Types.ObjectId, ref: "GoodsReceipt", default: null },
  items: { type: [supplierReturnItemSchema], required: true },
  totalValueMinor: { type: Number, required: true, min: 0, default: 0 },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  returnedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  returnedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, versionKey: false });

supplierReturnSchema.index({ returnNumber: 1 }, { unique: true });
supplierReturnSchema.index({ supplierId: 1, returnedAt: -1 });
supplierReturnSchema.index({ storeId: 1, returnedAt: -1 });
supplierReturnSchema.index({ purchaseOrderId: 1, returnedAt: -1 });

export type SupplierReturn = InferSchemaType<typeof supplierReturnSchema>;
export const SupplierReturnModel = model("SupplierReturn", supplierReturnSchema, "supplierReturns");
