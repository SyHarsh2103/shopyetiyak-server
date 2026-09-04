import { model, Schema, type InferSchemaType } from "mongoose";

const storeCreditAccountSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: "USD" },
    balanceMinor: { type: Number, required: true, min: 0, default: 0 },
    lifetimeCreditedMinor: { type: Number, required: true, min: 0, default: 0 },
    lifetimeDebitedMinor: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

export type StoreCreditAccount = InferSchemaType<typeof storeCreditAccountSchema>;
export const StoreCreditAccountModel = model("StoreCreditAccount", storeCreditAccountSchema, "storeCreditAccounts");
