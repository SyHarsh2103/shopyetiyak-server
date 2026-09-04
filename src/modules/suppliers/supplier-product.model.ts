import { model, Schema, type InferSchemaType } from "mongoose";

const supplierProductSchema = new Schema({
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  supplierSku: { type: String, trim: true, uppercase: true, maxlength: 100, default: "" },
  supplierProductName: { type: String, trim: true, maxlength: 220, default: "" },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
  unitCostMinor: { type: Number, required: true, min: 0, default: 0 },
  minimumOrderQuantity: { type: Number, required: true, min: 0.001, default: 1 },
  leadTimeDays: { type: Number, required: true, min: 0, max: 3650, default: 0 },
  isPreferred: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  lastReceivedCostMinor: { type: Number, min: 0, default: null },
  lastReceivedAt: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true, versionKey: false });

supplierProductSchema.index({ supplierId: 1, productId: 1, variantId: 1 }, { unique: true });
supplierProductSchema.index({ supplierId: 1, isActive: 1 });
supplierProductSchema.index({ productId: 1, variantId: 1, isPreferred: -1, isActive: 1 });
supplierProductSchema.index({ productId: 1, variantId: 1, isPreferred: 1 }, { unique: true, partialFilterExpression: { isPreferred: true, isActive: true } });
supplierProductSchema.index({ supplierSku: 1 });

export type SupplierProduct = InferSchemaType<typeof supplierProductSchema>;
export const SupplierProductModel = model("SupplierProduct", supplierProductSchema, "supplierProducts");
