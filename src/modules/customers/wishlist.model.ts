import { model, Schema, type InferSchemaType } from "mongoose";

const wishlistItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    variantId: { type: Schema.Types.ObjectId, required: true },
    addedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false, versionKey: false },
);

const wishlistSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", unique: true, index: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export type Wishlist = InferSchemaType<typeof wishlistSchema>;
export const WishlistModel = model("Wishlist", wishlistSchema, "wishlists");
