import { model, Schema, type InferSchemaType } from "mongoose";

const bannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    subtitle: { type: String, trim: true, maxlength: 300, default: "" },
    imageUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    linkUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    placement: { type: String, enum: ["HOME_HERO", "HOME_SECONDARY", "CATEGORY", "CHECKOUT"], default: "HOME_HERO" },
    storeIds: [{ type: Schema.Types.ObjectId, ref: "StoreLocation" }],
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    sortOrder: { type: Number, min: 0, max: 100000, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

bannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1, startsAt: 1, endsAt: 1 });
export type Banner = InferSchemaType<typeof bannerSchema>;
export const BannerModel = model("Banner", bannerSchema, "banners");
