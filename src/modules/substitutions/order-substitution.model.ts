import { model, Schema, type InferSchemaType } from "mongoose";

const imageSnapshotSchema = new Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    altText: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: false },
);

const selectedBatchSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch", required: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
    expiryDate: { type: Date, default: null },
  },
  { _id: false },
);

const orderSubstitutionSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true, index: true },
    originalProductId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    originalVariantId: { type: Schema.Types.ObjectId, required: true },
    originalProductNameSnapshot: { type: String, required: true, trim: true, maxlength: 240 },
    originalSkuSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    originalRequestedQuantity: { type: Number, required: true, min: 0.001 },
    originalLineSubtotalMinor: { type: Number, required: true, min: 0 },
    replacementProductId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    replacementVariantId: { type: Schema.Types.ObjectId, required: true },
    replacementProductNameSnapshot: { type: String, required: true, trim: true, maxlength: 240 },
    replacementProductSlugSnapshot: { type: String, required: true, trim: true, maxlength: 260 },
    replacementSkuSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    replacementProductTypeSnapshot: {
      type: String,
      required: true,
      enum: ["FIXED_QUANTITY", "PACKAGED", "WEIGHT_BASED", "VARIABLE_WEIGHT"],
    },
    replacementSellingUnitSnapshot: { type: String, required: true, trim: true, maxlength: 40 },
    replacementUnitQuantitySnapshot: { type: Number, required: true, min: 0 },
    replacementImageSnapshot: { type: imageSnapshotSchema, default: null },
    replacementQuantity: { type: Number, required: true, min: 0.001 },
    replacementUnitPriceMinor: { type: Number, required: true, min: 0 },
    replacementLineSubtotalMinor: { type: Number, required: true, min: 0 },
    replacementDiscountMinor: { type: Number, required: true, min: 0, default: 0 },
    replacementTaxMinor: { type: Number, required: true, min: 0, default: 0 },
    replacementFinalLineMinor: { type: Number, required: true, min: 0 },
    taxRateBasisPoints: { type: Number, required: true, min: 0, default: 0 },
    taxRuleId: { type: Schema.Types.ObjectId, ref: "TaxRule", default: null },
    selectedBatch: { type: selectedBatchSchema, default: null },
    reservedQuantity: { type: Number, required: true, min: 0 },
    customerApproved: { type: Boolean, default: false },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    status: { type: String, required: true, enum: ["ACTIVE", "CANCELLED"], default: "ACTIVE", index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    createdByRoleNames: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

orderSubstitutionSchema.index({ orderId: 1, createdAt: 1 });
orderSubstitutionSchema.index(
  { orderId: 1, orderItemId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);
orderSubstitutionSchema.index({ replacementProductId: 1, replacementVariantId: 1, createdAt: -1 });

export type OrderSubstitution = InferSchemaType<typeof orderSubstitutionSchema>;
export const OrderSubstitutionModel = model(
  "OrderSubstitution",
  orderSubstitutionSchema,
  "orderSubstitutions",
);
