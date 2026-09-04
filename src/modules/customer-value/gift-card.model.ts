import { model, Schema, type InferSchemaType } from "mongoose";

export const GIFT_CARD_STATUSES = ["ACTIVE", "DISABLED", "EXHAUSTED", "EXPIRED"] as const;

const giftCardSchema = new Schema(
  {
    codeHash: { type: String, required: true, trim: true, minlength: 64, maxlength: 64, unique: true, select: false },
    codeLastFour: { type: String, required: true, trim: true, minlength: 4, maxlength: 4, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
    initialBalanceMinor: { type: Number, required: true, min: 1 },
    balanceMinor: { type: Number, required: true, min: 0 },
    status: { type: String, enum: GIFT_CARD_STATUSES, required: true, default: "ACTIVE", index: true },
    expiresAt: { type: Date, default: null, index: true },
    recipientEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    issuedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

giftCardSchema.index({ status: 1, createdAt: -1 });
giftCardSchema.index({ recipientEmail: 1, createdAt: -1 });

export type GiftCard = InferSchemaType<typeof giftCardSchema>;
export const GiftCardModel = model("GiftCard", giftCardSchema, "giftCards");
