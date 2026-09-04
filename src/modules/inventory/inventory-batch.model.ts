import { model, Schema, type InferSchemaType } from "mongoose";

const inventoryBatchSchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
  supplierId: { type: Schema.Types.ObjectId, default: null },
  supplierName: { type: String, trim: true, maxlength: 180, default: "" },
  receivedDate: { type: Date, required: true },
  manufacturingDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  receivedQuantity: { type: Number, required: true, min: 0.001 },
  remainingQuantity: { type: Number, required: true, min: 0, default: 0 },
  costPriceMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
}, { timestamps: true, versionKey: false });

inventoryBatchSchema.index({ storeId: 1, productId: 1, variantId: 1, batchNumber: 1 }, { unique: true });
inventoryBatchSchema.index({ storeId: 1, expiryDate: 1, remainingQuantity: 1 });
inventoryBatchSchema.index({ productId: 1, variantId: 1, expiryDate: 1 });

export type InventoryBatch = InferSchemaType<typeof inventoryBatchSchema>;
export const InventoryBatchModel = model("InventoryBatch", inventoryBatchSchema, "inventoryBatches");
