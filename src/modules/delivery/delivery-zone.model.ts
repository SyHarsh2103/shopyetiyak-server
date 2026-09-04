import { model, Schema, type InferSchemaType } from "mongoose";

export const DELIVERY_ZONE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const deliveryZoneSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    postalCodes: { type: [String], default: [] },
    minimumOrderMinor: { type: Number, required: true, min: 0, default: 0 },
    deliveryFeeMinor: { type: Number, required: true, min: 0, default: 0 },
    freeDeliveryThresholdMinor: { type: Number, default: null, min: 0 },
    radiusKm: { type: Number, default: null, min: 0.1, max: 500 },
    centerLatitude: { type: Number, default: null, min: -90, max: 90 },
    centerLongitude: { type: Number, default: null, min: -180, max: 180 },
    availableDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    status: { type: String, enum: DELIVERY_ZONE_STATUSES, required: true, default: "ACTIVE", index: true },
  },
  { timestamps: true, versionKey: false },
);

deliveryZoneSchema.index({ storeId: 1, name: 1 }, { unique: true });
deliveryZoneSchema.index({ storeId: 1, postalCodes: 1, status: 1 });

export type DeliveryZone = InferSchemaType<typeof deliveryZoneSchema>;
export const DeliveryZoneModel = model("DeliveryZone", deliveryZoneSchema, "deliveryZones");
