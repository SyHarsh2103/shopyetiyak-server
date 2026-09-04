import { model, Schema, type InferSchemaType } from "mongoose";

const storeProductSchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  isAvailable: { type: Boolean, default: true },
  pickupEnabled: { type: Boolean, default: true },
  deliveryEnabled: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

storeProductSchema.index({ storeId: 1, productId: 1 }, { unique: true });
storeProductSchema.index({ storeId: 1, isAvailable: 1 });
storeProductSchema.index({ productId: 1, isAvailable: 1 });

export type StoreProduct = InferSchemaType<typeof storeProductSchema>;
export const StoreProductModel = model("StoreProduct", storeProductSchema, "storeProducts");
