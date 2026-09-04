import { model, Schema, type InferSchemaType } from "mongoose";

export const PICKUP_SLOT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const pickupSlotSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    date: { type: String, required: true, trim: true, maxlength: 10, index: true },
    startTime: { type: String, required: true, trim: true, maxlength: 5 },
    endTime: { type: String, required: true, trim: true, maxlength: 5 },
    timezone: { type: String, required: true, trim: true, maxlength: 80 },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
    bookedCount: { type: Number, required: true, min: 0, default: 0 },
    cutoffMinutes: { type: Number, required: true, min: 0, max: 10080, default: 60 },
    cutoffAt: { type: Date, required: true, index: true },
    status: { type: String, enum: PICKUP_SLOT_STATUSES, required: true, default: "ACTIVE", index: true },
  },
  { timestamps: true, versionKey: false },
);

pickupSlotSchema.index(
  { storeId: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true },
);
pickupSlotSchema.index({ storeId: 1, date: 1, status: 1, startTime: 1 });

export type PickupSlot = InferSchemaType<typeof pickupSlotSchema>;
export const PickupSlotModel = model("PickupSlot", pickupSlotSchema, "pickupSlots");
