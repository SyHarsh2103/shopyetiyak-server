import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DeliverySlotModel } from "../src/modules/delivery/delivery-slot.model.js";
import {
  createDeliveryZone,
  listPublicDeliverySlots,
  quoteDeliverySelection,
  releaseDeliverySlotInSession,
  reserveDeliverySlotInSession,
} from "../src/modules/delivery/delivery.service.js";
import { DeliveryZoneModel } from "../src/modules/delivery/delivery-zone.model.js";
import { PickupSlotModel } from "../src/modules/pickup/pickup-slot.model.js";
import {
  listPublicPickupSlots,
  releasePickupSlotInSession,
  reservePickupSlotInSession,
} from "../src/modules/pickup/pickup.service.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let replicaSet: MongoMemoryReplSet;
let storeId = "";
let zoneId = "";
let deliverySlotId = "";
let pickupSlotId = "";

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());

  const store = await StoreLocationModel.create({
    name: "Phase 11 Store",
    code: "P11",
    address: { line1: "11 Delivery Way", line2: "", city: "Jersey City", state: "NJ", postalCode: "07302", country: "USA" },
    timezone: "America/New_York",
    pickupEnabled: true,
    deliveryEnabled: true,
    status: "ACTIVE",
  });
  storeId = store.id;

  const zone = await DeliveryZoneModel.create({
    storeId: store._id,
    name: "Downtown",
    postalCodes: ["07302"],
    minimumOrderMinor: 2500,
    deliveryFeeMinor: 499,
    freeDeliveryThresholdMinor: 7500,
    availableDays: [5],
    status: "ACTIVE",
  });
  zoneId = zone.id;

  const deliverySlot = await DeliverySlotModel.create({
    storeId: store._id,
    zoneId: zone._id,
    date: "2099-01-02",
    startTime: "09:00",
    endTime: "11:00",
    timezone: store.timezone,
    capacity: 1,
    bookedCount: 0,
    cutoffMinutes: 120,
    cutoffAt: new Date("2099-01-02T12:00:00.000Z"),
    status: "ACTIVE",
  });
  deliverySlotId = deliverySlot.id;

  await DeliverySlotModel.create({
    storeId: store._id,
    zoneId: zone._id,
    date: "2099-01-03",
    startTime: "09:00",
    endTime: "11:00",
    timezone: store.timezone,
    capacity: 5,
    bookedCount: 0,
    cutoffMinutes: 120,
    cutoffAt: new Date("2099-01-03T12:00:00.000Z"),
    status: "ACTIVE",
  });

  const pickupSlot = await PickupSlotModel.create({
    storeId: store._id,
    date: "2099-01-02",
    startTime: "12:00",
    endTime: "14:00",
    timezone: store.timezone,
    capacity: 1,
    bookedCount: 0,
    cutoffMinutes: 60,
    cutoffAt: new Date("2099-01-02T16:00:00.000Z"),
    status: "ACTIVE",
  });
  pickupSlotId = pickupSlot.id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

describe("Phase 11 delivery and pickup capacity", () => {
  it("quotes ZIP delivery rules and prevents overbooking", async () => {
    const publicResult = await listPublicDeliverySlots(storeId, "07302");
    expect(publicResult.zone.id).toBe(zoneId);
    expect(publicResult.slots).toHaveLength(1);

    const paidFee = await quoteDeliverySelection({ storeId, postalCode: "07302", merchandiseMinor: 5000, slotId: deliverySlotId });
    expect(paidFee.feeMinor).toBe(499);

    const freeFee = await quoteDeliverySelection({ storeId, postalCode: "07302", merchandiseMinor: 8000, slotId: deliverySlotId });
    expect(freeFee.feeMinor).toBe(0);

    await expect(
      createDeliveryZone({
        storeId,
        name: "Conflicting Zone",
        postalCodes: ["07302"],
        minimumOrderMinor: 0,
        deliveryFeeMinor: 0,
        freeDeliveryThresholdMinor: null,
        radiusKm: null,
        centerLatitude: null,
        centerLongitude: null,
        availableDays: [5],
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "DELIVERY_POSTAL_CODE_CONFLICT" });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await reserveDeliverySlotInSession(session, { slotId: deliverySlotId, storeId, zoneId });
      });
      await expect(
        session.withTransaction(async () => reserveDeliverySlotInSession(session, { slotId: deliverySlotId, storeId, zoneId })),
      ).rejects.toMatchObject({ code: "DELIVERY_SLOT_FULL" });
      await session.withTransaction(async () => releaseDeliverySlotInSession(session, new mongoose.Types.ObjectId(deliverySlotId)));
    } finally {
      await session.endSession();
    }

    const slot = await DeliverySlotModel.findById(deliverySlotId).lean();
    expect(slot?.bookedCount).toBe(0);
  });

  it("enforces pickup capacity and releases cancelled reservations", async () => {
    const slots = await listPublicPickupSlots(storeId);
    expect(slots.map((slot) => slot.id)).toContain(pickupSlotId);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await reservePickupSlotInSession(session, { slotId: pickupSlotId, storeId });
      });
      await expect(
        session.withTransaction(async () => reservePickupSlotInSession(session, { slotId: pickupSlotId, storeId })),
      ).rejects.toMatchObject({ code: "PICKUP_SLOT_FULL" });
      await session.withTransaction(async () => releasePickupSlotInSession(session, new mongoose.Types.ObjectId(pickupSlotId)));
    } finally {
      await session.endSession();
    }

    const slot = await PickupSlotModel.findById(pickupSlotId).lean();
    expect(slot?.bookedCount).toBe(0);
  });
});
