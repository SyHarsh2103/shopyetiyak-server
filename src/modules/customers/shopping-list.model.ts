import { model, Schema, type InferSchemaType } from "mongoose";

const shoppingListItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 0.001, max: 100000 },
    addedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false, versionKey: false },
);

const shoppingListSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, trim: true, maxlength: 80 },
    items: { type: [shoppingListItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

shoppingListSchema.index({ customerId: 1, nameKey: 1 }, { unique: true });
shoppingListSchema.index({ customerId: 1, updatedAt: -1 });

export type ShoppingList = InferSchemaType<typeof shoppingListSchema>;
export const ShoppingListModel = model("ShoppingList", shoppingListSchema, "shoppingLists");
