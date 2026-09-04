import { model, Schema, type InferSchemaType } from "mongoose";

const recipeIngredientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    amount: { type: Number, min: 0, default: null },
    unit: { type: String, trim: true, maxlength: 40, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantId: { type: Schema.Types.ObjectId, default: null },
    cartQuantity: { type: Number, min: 0.001, default: 1 },
    optional: { type: Boolean, default: false },
  },
  { _id: true },
);

const recipeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    shortDescription: { type: String, trim: true, maxlength: 320, default: "" },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    imageUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    preparationMinutes: { type: Number, min: 0, max: 1440, default: 0 },
    cookingMinutes: { type: Number, min: 0, max: 1440, default: 0 },
    servings: { type: Number, min: 1, max: 1000, default: 1 },
    cuisine: { type: String, trim: true, maxlength: 100, default: "" },
    dietary: { type: [String], default: [] },
    steps: { type: [String], default: [] },
    ingredients: { type: [recipeIngredientSchema], default: [] },
    mealKitBundleId: { type: Schema.Types.ObjectId, ref: "Bundle", default: null },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    seo: {
      title: { type: String, trim: true, maxlength: 180, default: "" },
      description: { type: String, trim: true, maxlength: 320, default: "" },
      keywords: { type: [String], default: [] },
    },
  },
  { timestamps: true, versionKey: false },
);

recipeSchema.index({ slug: 1 }, { unique: true });
recipeSchema.index({ isActive: 1, isFeatured: -1, createdAt: -1 });
recipeSchema.index({ cuisine: 1, isActive: 1 });
recipeSchema.index({ "ingredients.productId": 1 });
recipeSchema.index({ mealKitBundleId: 1 });

export type Recipe = InferSchemaType<typeof recipeSchema>;
export const RecipeModel = model("Recipe", recipeSchema, "recipes");
