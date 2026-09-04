import { model, Schema, type InferSchemaType } from "mongoose";

const inventorySchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  quantityOnHand: { type: Number, required: true, min: 0, default: 0 },
  quantityReserved: { type: Number, required: true, min: 0, default: 0 },
  quantityAvailable: { type: Number, required: true, min: 0, default: 0 },
  reorderLevel: { type: Number, required: true, min: 0, default: 0 },
  reorderQuantity: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true, versionKey: false });

inventorySchema.index({ storeId: 1, productId: 1, variantId: 1 }, { unique: true });
inventorySchema.index({ storeId: 1, quantityAvailable: 1 });
inventorySchema.index({ storeId: 1, reorderLevel: 1, quantityAvailable: 1 });
inventorySchema.index({ productId: 1, variantId: 1 });

export type Inventory = InferSchemaType<typeof inventorySchema>;
export const InventoryModel = model("Inventory", inventorySchema, "inventories");
