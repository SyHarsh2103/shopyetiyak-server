import { model, Schema, type InferSchemaType } from "mongoose";

const componentSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, min: 0.001, required: true },
}, { _id: false });

const bundleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    bundleType: { type: String, enum: ["STANDARD", "MEAL_KIT"], default: "STANDARD" },
    components: { type: [componentSchema], required: true, validate: [(value: unknown[]) => value.length > 0, "At least one component is required."] },
    pricingMode: { type: String, enum: ["SUM_COMPONENTS", "FIXED"], default: "SUM_COMPONENTS" },
    fixedPriceMinor: { type: Number, min: 0, default: null },
    currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
    isFeatured: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

bundleSchema.index({ slug: 1 }, { unique: true });
bundleSchema.index({ bundleType: 1, isActive: 1, isFeatured: -1, startsAt: 1, endsAt: 1 });
export type Bundle = InferSchemaType<typeof bundleSchema>;
export const BundleModel = model("Bundle", bundleSchema, "bundles");
