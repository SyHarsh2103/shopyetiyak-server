import { describe, expect, it } from "vitest";

import { deliverySlotInputSchema, deliveryZoneInputSchema } from "../src/modules/delivery/delivery.validation.js";
import { pickupSlotInputSchema } from "../src/modules/pickup/pickup.validation.js";

const objectId = "507f1f77bcf86cd799439011";

describe("Phase 11 fulfillment validation", () => {
  it("validates delivery zone fee and radius rules", () => {
    expect(deliveryZoneInputSchema.safeParse({
      storeId: objectId,
      name: "Zone A",
      postalCodes: ["07302"],
      minimumOrderMinor: 2500,
      deliveryFeeMinor: 499,
      freeDeliveryThresholdMinor: 7500,
      radiusKm: 5,
      centerLatitude: null,
      centerLongitude: null,
      availableDays: [1, 2, 3],
      status: "ACTIVE",
    }).success).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(deliverySlotInputSchema.safeParse({
      storeId: objectId,
      zoneId: null,
      date: "2026-02-31",
      startTime: "10:00",
      endTime: "12:00",
      capacity: 20,
      cutoffMinutes: 120,
      status: "ACTIVE",
    }).success).toBe(false);
  });

  it("rejects delivery and pickup slots with reversed times", () => {
    expect(deliverySlotInputSchema.safeParse({
      storeId: objectId,
      zoneId: null,
      date: "2026-08-20",
      startTime: "14:00",
      endTime: "12:00",
      capacity: 20,
      cutoffMinutes: 120,
      status: "ACTIVE",
    }).success).toBe(false);

    expect(pickupSlotInputSchema.safeParse({
      storeId: objectId,
      date: "2026-08-20",
      startTime: "15:00",
      endTime: "13:00",
      capacity: 20,
      cutoffMinutes: 60,
      status: "ACTIVE",
    }).success).toBe(false);
  });
});
