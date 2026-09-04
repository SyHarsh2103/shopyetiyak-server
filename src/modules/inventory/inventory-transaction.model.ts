import { model, Schema, type InferSchemaType } from "mongoose";

export const INVENTORY_TRANSACTION_TYPES = [
  "PURCHASE_RECEIPT",
  "ORDER_RESERVATION",
  "ORDER_COMMIT",
  "ORDER_RELEASE",
  "RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DAMAGED",
  "EXPIRED",
  "SPOILED",
  "LOST",
  "THEFT",
  "MANUAL_ADJUSTMENT",
  "SUPPLIER_RETURN",
  "CUSTOMER_RETURN",
  "INTERNAL_USE",
  "SAMPLE",
] as const;

export const INVENTORY_ADJUSTMENT_REASONS = [
  "EXPIRED",
  "SPOILED",
  "DAMAGED",
  "BROKEN",
  "LOST",
  "THEFT",
  "SAMPLE",
  "INTERNAL_USE",
  "INCORRECT_COUNT",
  "SUPPLIER_RETURN",
  "CUSTOMER_RETURN",
  "OTHER",
] as const;

const balanceSchema = new Schema({
  quantityOnHand: { type: Number, required: true, min: 0 },
  quantityReserved: { type: Number, required: true, min: 0 },
  quantityAvailable: { type: Number, required: true, min: 0 },
}, { _id: false });

const batchAllocationSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true },
  batchNumber: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0.001 },
}, { _id: false });

const inventoryTransactionSchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, enum: INVENTORY_TRANSACTION_TYPES, index: true },
  quantityOnHandDelta: { type: Number, required: true, default: 0 },
  quantityReservedDelta: { type: Number, required: true, default: 0 },
  quantityAvailableDelta: { type: Number, required: true, default: 0 },
  balanceBefore: { type: balanceSchema, required: true },
  balanceAfter: { type: balanceSchema, required: true },
  adjustmentReason: { type: String, enum: INVENTORY_ADJUSTMENT_REASONS, default: null },
  batchAllocations: { type: [batchAllocationSchema], default: [] },
  referenceType: { type: String, trim: true, maxlength: 60, default: "" },
  referenceId: { type: String, trim: true, maxlength: 160, default: "" },
  transferId: { type: String, trim: true, maxlength: 80, default: "" },
  note: { type: String, trim: true, maxlength: 1000, default: "" },
  actorAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  actorRoleNames: { type: [String], default: [] },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

inventoryTransactionSchema.index({ storeId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ productId: 1, variantId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ transferId: 1 });

export type InventoryTransaction = InferSchemaType<typeof inventoryTransactionSchema>;
export const InventoryTransactionModel = model("InventoryTransaction", inventoryTransactionSchema, "inventoryTransactions");
