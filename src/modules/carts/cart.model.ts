import { model, Schema, type InferSchemaType } from "mongoose";

const cartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    savedForLater: { type: Boolean, default: false },
    addedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    guestTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "StoreLocation",
      required: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: [
        (value: unknown[]) => value.length <= 200,
        "A cart can contain at most 200 product options.",
      ],
    },
    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 40,
      default: "",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

cartSchema.index(
  { customerId: 1, storeId: 1 },
  {
    unique: true,
    partialFilterExpression: { customerId: { $type: "objectId" } },
  },
);
cartSchema.index(
  { guestTokenHash: 1, storeId: 1 },
  {
    unique: true,
    partialFilterExpression: { guestTokenHash: { $type: "string" } },
  },
);
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
cartSchema.index({ updatedAt: -1 });

export type Cart = InferSchemaType<typeof cartSchema>;
export const CartModel = model("Cart", cartSchema, "carts");
