import mongoose, { type ClientSession, Types } from "mongoose";
import type { z } from "zod";

import { OrderStatusHistoryModel } from "../orders/order-status-history.model.js";
import { OrderModel } from "../orders/order.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { ApiError } from "../../utils/api-error.js";
import { localDayOfWeek, normalizePostalCode, zonedDateTimeToUtc } from "../../utils/timezone.js";
import { DeliverySlotModel } from "./delivery-slot.model.js";
import { DeliveryZoneModel } from "./delivery-zone.model.js";
import type {
  deliverySlotInputSchema,
  deliverySlotListQuerySchema,
  deliverySlotUpdateSchema,
  deliveryZoneInputSchema,
  deliveryZoneListQuerySchema,
  deliveryZoneUpdateSchema,
} from "./delivery.validation.js";

type DeliveryZoneInput = z.infer<typeof deliveryZoneInputSchema>;
type DeliveryZoneUpdate = z.infer<typeof deliveryZoneUpdateSchema>;
type DeliveryZoneListQuery = z.infer<typeof deliveryZoneListQuerySchema>;
type DeliverySlotInput = z.infer<typeof deliverySlotInputSchema>;
type DeliverySlotUpdate = z.infer<typeof deliverySlotUpdateSchema>;
type DeliverySlotListQuery = z.infer<typeof deliverySlotListQuerySchema>;

export interface DeliveryActor {
  adminUserId: string;
  roleNames: string[];
}

function uniquePostalCodes(values: string[]): string[] {
  return [...new Set(values.map(normalizePostalCode).filter(Boolean))];
}

async function activeStore(storeId: string) {
  const store = await StoreLocationModel.findOne({ _id: new Types.ObjectId(storeId), status: "ACTIVE" }).lean();
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store location not found.");
  return store;
}

async function activeDeliveryStore(storeId: string) {
  const store = await activeStore(storeId);
  if (!store.deliveryEnabled) {
    throw new ApiError(409, "DELIVERY_NOT_AVAILABLE", "Delivery is not enabled for this store.");
  }
  return store;
}

async function assertPostalCodesAvailable(
  storeId: Types.ObjectId,
  postalCodes: string[],
  excludeZoneId?: Types.ObjectId,
): Promise<void> {
  if (postalCodes.length === 0) return;

  const conflict = await DeliveryZoneModel.findOne({
    storeId,
    status: "ACTIVE",
    postalCodes: { $in: postalCodes },
    ...(excludeZoneId ? { _id: { $ne: excludeZoneId } } : {}),
  }).lean();

  if (conflict) {
    const overlapping = conflict.postalCodes.filter((code) => postalCodes.includes(code));
    throw new ApiError(
      409,
      "DELIVERY_POSTAL_CODE_CONFLICT",
      `Postal code${overlapping.length === 1 ? "" : "s"} ${overlapping.join(", ")} already belong${overlapping.length === 1 ? "s" : ""} to another active delivery zone.`,
    );
  }
}

export async function listDeliveryZones(query: DeliveryZoneListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.status) filter.status = query.status;
  return DeliveryZoneModel.find(filter).sort({ storeId: 1, name: 1 }).lean();
}

export async function createDeliveryZone(input: DeliveryZoneInput) {
  const store = await activeStore(input.storeId);
  const postalCodes = uniquePostalCodes(input.postalCodes);
  if (input.status === "ACTIVE") {
    await assertPostalCodesAvailable(store._id, postalCodes);
  }
  try {
    return await DeliveryZoneModel.create({
      ...input,
      storeId: store._id,
      postalCodes,
      availableDays: [...new Set(input.availableDays)].sort((a, b) => a - b),
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000) {
      throw new ApiError(409, "DELIVERY_ZONE_EXISTS", "A delivery zone with this name already exists for the store.");
    }
    throw error;
  }
}

export async function updateDeliveryZone(id: string, input: DeliveryZoneUpdate) {
  const zone = await DeliveryZoneModel.findById(id);
  if (!zone) throw new ApiError(404, "DELIVERY_ZONE_NOT_FOUND", "Delivery zone was not found.");

  const postalCodes = input.postalCodes ? uniquePostalCodes(input.postalCodes) : [...zone.postalCodes];
  const nextStatus = input.status ?? zone.status;
  if (nextStatus === "ACTIVE") {
    await assertPostalCodesAvailable(zone.storeId, postalCodes, zone._id);
  }

  zone.set({
    ...input,
    ...(input.postalCodes ? { postalCodes } : {}),
    ...(input.availableDays ? { availableDays: [...new Set(input.availableDays)].sort((a, b) => a - b) } : {}),
  });
  await zone.save();
  return zone;
}

export async function resolveDeliveryZone(storeId: string, postalCode: string) {
  await activeDeliveryStore(storeId);
  const normalized = normalizePostalCode(postalCode);
  const zone = await DeliveryZoneModel.findOne({
    storeId: new Types.ObjectId(storeId),
    status: "ACTIVE",
    postalCodes: normalized,
  }).lean();
  if (!zone) {
    throw new ApiError(409, "DELIVERY_POSTAL_CODE_UNAVAILABLE", "Delivery is not available for this postal code.");
  }
  return zone;
}

function slotAvailability<T extends { _id: Types.ObjectId; date: string; startTime: string; endTime: string; timezone: string; capacity: number; bookedCount: number; cutoffAt: Date }>(slot: T) {
  return {
    id: slot._id.toString(),
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    timezone: slot.timezone,
    capacity: slot.capacity,
    bookedCount: slot.bookedCount,
    remainingCapacity: Math.max(0, slot.capacity - slot.bookedCount),
    cutoffAt: slot.cutoffAt.toISOString(),
  };
}

export async function listPublicDeliverySlots(storeId: string, postalCode: string, date?: string) {
  const zone = await resolveDeliveryZone(storeId, postalCode);
  const filter: Record<string, unknown> = {
    storeId: new Types.ObjectId(storeId),
    status: "ACTIVE",
    cutoffAt: { $gt: new Date() },
    $or: [{ zoneId: zone._id }, { zoneId: null }],
  };
  if (date) filter.date = date;
  const slots = await DeliverySlotModel.find(filter).sort({ date: 1, startTime: 1 }).lean();
  return {
    zone: {
      id: zone._id.toString(),
      name: zone.name,
      minimumOrderMinor: zone.minimumOrderMinor,
      deliveryFeeMinor: zone.deliveryFeeMinor,
      freeDeliveryThresholdMinor: zone.freeDeliveryThresholdMinor ?? null,
    },
    slots: slots
      .filter(
        (slot) =>
          slot.bookedCount < slot.capacity &&
          zone.availableDays.includes(localDayOfWeek(slot.date)),
      )
      .map(slotAvailability),
  };
}

export async function quoteDeliverySelection(input: {
  storeId: string;
  postalCode: string;
  merchandiseMinor: number;
  slotId?: string;
}) {
  const zone = await resolveDeliveryZone(input.storeId, input.postalCode);
  if (input.merchandiseMinor < zone.minimumOrderMinor) {
    throw new ApiError(
      409,
      "DELIVERY_MINIMUM_NOT_MET",
      `Delivery requires a minimum merchandise total of ${(zone.minimumOrderMinor / 100).toFixed(2)} in the order currency.`,
    );
  }
  const threshold = zone.freeDeliveryThresholdMinor ?? null;
  const feeMinor = threshold !== null && input.merchandiseMinor >= threshold ? 0 : zone.deliveryFeeMinor;

  let slot = null;
  if (input.slotId) {
    slot = await DeliverySlotModel.findOne({
      _id: new Types.ObjectId(input.slotId),
      storeId: new Types.ObjectId(input.storeId),
      status: "ACTIVE",
      cutoffAt: { $gt: new Date() },
      $or: [{ zoneId: zone._id }, { zoneId: null }],
    }).lean();
    if (!slot || slot.bookedCount >= slot.capacity) {
      throw new ApiError(409, "DELIVERY_SLOT_UNAVAILABLE", "The selected delivery slot is no longer available.");
    }
    if (!zone.availableDays.includes(localDayOfWeek(slot.date))) {
      throw new ApiError(409, "DELIVERY_DAY_UNAVAILABLE", "The selected delivery day is not enabled for this zone.");
    }
  }

  return {
    zone: {
      id: zone._id.toString(),
      name: zone.name,
      minimumOrderMinor: zone.minimumOrderMinor,
      deliveryFeeMinor: zone.deliveryFeeMinor,
      freeDeliveryThresholdMinor: threshold,
    },
    feeMinor,
    slot: slot ? slotAvailability(slot) : null,
  };
}

export async function listDeliverySlots(query: DeliverySlotListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.zoneId) filter.zoneId = new Types.ObjectId(query.zoneId);
  if (query.date) filter.date = query.date;
  if (query.status) filter.status = query.status;
  return DeliverySlotModel.find(filter).sort({ date: 1, startTime: 1 }).lean();
}

async function slotFields(input: DeliverySlotInput | (DeliverySlotUpdate & { storeId: string }), existingTimezone?: string) {
  const store = await activeStore(input.storeId);
  const timezone = store.timezone || existingTimezone || "America/New_York";
  if (input.zoneId) {
    const zone = await DeliveryZoneModel.findOne({ _id: new Types.ObjectId(input.zoneId), storeId: store._id }).lean();
    if (!zone) throw new ApiError(404, "DELIVERY_ZONE_NOT_FOUND", "Delivery zone was not found for this store.");
  }
  if (!input.date || !input.startTime) {
    return { timezone };
  }
  const startAt = zonedDateTimeToUtc(input.date, input.startTime, timezone);
  const cutoffMinutes = input.cutoffMinutes ?? 120;
  return {
    timezone,
    cutoffAt: new Date(startAt.getTime() - cutoffMinutes * 60_000),
  };
}

export async function createDeliverySlot(input: DeliverySlotInput) {
  const computed = await slotFields(input);
  try {
    return await DeliverySlotModel.create({
      ...input,
      storeId: new Types.ObjectId(input.storeId),
      zoneId: input.zoneId ? new Types.ObjectId(input.zoneId) : null,
      ...computed,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000) {
      throw new ApiError(409, "DELIVERY_SLOT_EXISTS", "This delivery time slot already exists.");
    }
    throw error;
  }
}

export async function updateDeliverySlot(id: string, input: DeliverySlotUpdate) {
  const slot = await DeliverySlotModel.findById(id);
  if (!slot) throw new ApiError(404, "DELIVERY_SLOT_NOT_FOUND", "Delivery slot was not found.");
  if (input.capacity !== undefined && input.capacity < slot.bookedCount) {
    throw new ApiError(409, "SLOT_CAPACITY_BELOW_BOOKINGS", "Capacity cannot be reduced below the current booked count.");
  }
  const merged = {
    storeId: slot.storeId.toString(),
    date: input.date ?? slot.date,
    startTime: input.startTime ?? slot.startTime,
    cutoffMinutes: input.cutoffMinutes ?? slot.cutoffMinutes,
    zoneId: input.zoneId === undefined ? slot.zoneId?.toString() ?? null : input.zoneId,
  };
  const computed = await slotFields(merged, slot.timezone);
  slot.set({
    ...input,
    ...(input.zoneId !== undefined ? { zoneId: input.zoneId ? new Types.ObjectId(input.zoneId) : null } : {}),
    ...computed,
  });
  await slot.save();
  return slot;
}

export async function reserveDeliverySlotInSession(
  session: ClientSession,
  input: { slotId: string; storeId: string; zoneId: string },
): Promise<void> {
  const result = await DeliverySlotModel.updateOne(
    {
      _id: new Types.ObjectId(input.slotId),
      storeId: new Types.ObjectId(input.storeId),
      status: "ACTIVE",
      cutoffAt: { $gt: new Date() },
      $or: [{ zoneId: new Types.ObjectId(input.zoneId) }, { zoneId: null }],
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    },
    { $inc: { bookedCount: 1 } },
    { session },
  );
  if (result.modifiedCount !== 1) {
    throw new ApiError(409, "DELIVERY_SLOT_FULL", "The selected delivery slot became unavailable. Choose another slot.");
  }
}

export async function releaseDeliverySlotInSession(session: ClientSession, slotId: Types.ObjectId): Promise<void> {
  await DeliverySlotModel.updateOne(
    { _id: slotId, bookedCount: { $gt: 0 } },
    { $inc: { bookedCount: -1 } },
    { session },
  );
}

async function writeDeliveryHistory(
  session: ClientSession,
  order: { _id: Types.ObjectId; orderNumber: string },
  fromStatus: string,
  toStatus: string,
  actor: DeliveryActor,
  note: string,
) {
  const history = new OrderStatusHistoryModel({
    orderId: order._id,
    orderNumber: order.orderNumber,
    fromStatus,
    toStatus,
    actorType: "ADMIN",
    actorId: new Types.ObjectId(actor.adminUserId),
    actorRoleNames: actor.roleNames,
    note,
  });
  await history.save({ session });
}

export async function listDeliveryOrders() {
  return OrderModel.find({
    fulfillmentType: "DELIVERY",
    orderStatus: { $in: ["READY", "OUT_FOR_DELIVERY"] },
  }).sort({ "deliverySlot.date": 1, "deliverySlot.startTime": 1, createdAt: 1 }).lean();
}

export async function advanceDeliveryOrder(orderId: string, action: "OUT_FOR_DELIVERY" | "DELIVERED", actor: DeliveryActor, note: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.fulfillmentType !== "DELIVERY") throw new ApiError(409, "ORDER_NOT_DELIVERY", "This order is not a delivery order.");
      const expected = action === "OUT_FOR_DELIVERY" ? "READY" : "OUT_FOR_DELIVERY";
      if (order.orderStatus === action) return;
      if (order.orderStatus !== expected) {
        throw new ApiError(409, "DELIVERY_STATUS_INVALID", `Order must be ${expected.replaceAll("_", " ")} before this action.`);
      }
      if (order.inventoryReservationStatus !== "COMMITTED") {
        throw new ApiError(409, "DELIVERY_INVENTORY_NOT_COMMITTED", "Inventory must be committed before delivery handoff.");
      }
      const previous = order.orderStatus;
      order.orderStatus = action;
      if (action === "DELIVERED") order.fulfillmentSlotReservationStatus = "FULFILLED";
      await order.save({ session });
      await writeDeliveryHistory(session, order, previous, action, actor, note || (action === "DELIVERED" ? "Order delivered." : "Order handed off for delivery."));
    });
  } finally {
    await session.endSession();
  }
  return OrderModel.findById(orderId).lean();
}
