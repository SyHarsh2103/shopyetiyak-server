import { model, Schema, type InferSchemaType } from "mongoose";

export const DELIVERY_SLOT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const deliverySlotSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: "DeliveryZone", default: null, index: true },
    date: { type: String, required: true, trim: true, maxlength: 10, index: true },
    startTime: { type: String, required: true, trim: true, maxlength: 5 },
    endTime: { type: String, required: true, trim: true, maxlength: 5 },
    timezone: { type: String, required: true, trim: true, maxlength: 80 },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
    bookedCount: { type: Number, required: true, min: 0, default: 0 },
    cutoffMinutes: { type: Number, required: true, min: 0, max: 10080, default: 120 },
    cutoffAt: { type: Date, required: true, index: true },
    status: { type: String, enum: DELIVERY_SLOT_STATUSES, required: true, default: "ACTIVE", index: true },
  },
  { timestamps: true, versionKey: false },
);

deliverySlotSchema.index(
  { storeId: 1, zoneId: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true },
);
deliverySlotSchema.index({ storeId: 1, date: 1, status: 1, startTime: 1 });

export type DeliverySlot = InferSchemaType<typeof deliverySlotSchema>;
export const DeliverySlotModel = model("DeliverySlot", deliverySlotSchema, "deliverySlots");
