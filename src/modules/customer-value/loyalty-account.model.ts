import { model, Schema, type InferSchemaType } from "mongoose";

const loyaltyAccountSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true, index: true },
    pointsBalance: { type: Number, required: true, min: 0, default: 0 },
    lifetimeEarnedPoints: { type: Number, required: true, min: 0, default: 0 },
    lifetimeRedeemedPoints: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

export type LoyaltyAccount = InferSchemaType<typeof loyaltyAccountSchema>;
export const LoyaltyAccountModel = model("LoyaltyAccount", loyaltyAccountSchema, "loyaltyAccounts");
