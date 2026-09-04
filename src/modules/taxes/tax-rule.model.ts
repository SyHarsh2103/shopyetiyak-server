import { model, Schema, type InferSchemaType } from "mongoose";

const taxRuleSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    state: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: "",
    },
    postalCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 32,
      default: "",
    },
    taxClassification: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 100,
      default: "",
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    rateBasisPoints: {
      type: Number,
      required: true,
      min: 0,
      max: 10000,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    priority: {
      type: Number,
      required: true,
      min: -1000,
      max: 1000,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

taxRuleSchema.index({ country: 1, state: 1, postalCode: 1, isActive: 1 });
taxRuleSchema.index({ productId: 1, isActive: 1 });
taxRuleSchema.index({ taxClassification: 1, isActive: 1 });
taxRuleSchema.index({ startsAt: 1, endsAt: 1, isActive: 1 });

export type TaxRule = InferSchemaType<typeof taxRuleSchema>;
export const TaxRuleModel = model("TaxRule", taxRuleSchema, "taxRules");
