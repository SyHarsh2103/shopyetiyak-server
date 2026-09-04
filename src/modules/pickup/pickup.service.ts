import mongoose, { type ClientSession, Types } from "mongoose";
import type { z } from "zod";

import { OrderStatusHistoryModel } from "../orders/order-status-history.model.js";
import { OrderModel } from "../orders/order.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { ApiError } from "../../utils/api-error.js";
import { zonedDateTimeToUtc } from "../../utils/timezone.js";
import { PickupSlotModel } from "./pickup-slot.model.js";
import type { pickupSlotInputSchema, pickupSlotListQuerySchema, pickupSlotUpdateSchema } from "./pickup.validation.js";

type PickupSlotInput = z.infer<typeof pickupSlotInputSchema>;
type PickupSlotUpdate = z.infer<typeof pickupSlotUpdateSchema>;
type PickupSlotListQuery = z.infer<typeof pickupSlotListQuerySchema>;

export interface PickupActor {
  adminUserId: string;
  roleNames: string[];
}

async function activeStore(storeId: string) {
  const store = await StoreLocationModel.findOne({ _id: new Types.ObjectId(storeId), status: "ACTIVE" }).lean();
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Store location not found.");
  if (!store.pickupEnabled) throw new ApiError(409, "PICKUP_NOT_AVAILABLE", "Pickup is not enabled for this store.");
  return store;
}

function serializeSlot<T extends { _id: Types.ObjectId; date: string; startTime: string; endTime: string; timezone: string; capacity: number; bookedCount: number; cutoffAt: Date }>(slot: T) {
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

export async function listPublicPickupSlots(storeId: string, date?: string) {
  await activeStore(storeId);
  const filter: Record<string, unknown> = {
    storeId: new Types.ObjectId(storeId),
    status: "ACTIVE",
    cutoffAt: { $gt: new Date() },
  };
  if (date) filter.date = date;
  const slots = await PickupSlotModel.find(filter).sort({ date: 1, startTime: 1 }).lean();
  return slots.filter((slot) => slot.bookedCount < slot.capacity).map(serializeSlot);
}

export async function quotePickupSelection(storeId: string, slotId?: string) {
  await activeStore(storeId);
  if (!slotId) return null;
  const slot = await PickupSlotModel.findOne({
    _id: new Types.ObjectId(slotId),
    storeId: new Types.ObjectId(storeId),
    status: "ACTIVE",
    cutoffAt: { $gt: new Date() },
  }).lean();
  if (!slot || slot.bookedCount >= slot.capacity) {
    throw new ApiError(409, "PICKUP_SLOT_UNAVAILABLE", "The selected pickup slot is no longer available.");
  }
  return serializeSlot(slot);
}

export async function listPickupSlots(query: PickupSlotListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.date) filter.date = query.date;
  if (query.status) filter.status = query.status;
  return PickupSlotModel.find(filter).sort({ date: 1, startTime: 1 }).lean();
}

export async function createPickupSlot(input: PickupSlotInput) {
  const store = await activeStore(input.storeId);
  const startAt = zonedDateTimeToUtc(input.date, input.startTime, store.timezone);
  const cutoffAt = new Date(startAt.getTime() - input.cutoffMinutes * 60_000);
  try {
    return await PickupSlotModel.create({
      ...input,
      storeId: new Types.ObjectId(input.storeId),
      timezone: store.timezone,
      cutoffAt,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000) {
      throw new ApiError(409, "PICKUP_SLOT_EXISTS", "This pickup time slot already exists.");
    }
    throw error;
  }
}

export async function updatePickupSlot(id: string, input: PickupSlotUpdate) {
  const slot = await PickupSlotModel.findById(id);
  if (!slot) throw new ApiError(404, "PICKUP_SLOT_NOT_FOUND", "Pickup slot was not found.");
  if (input.capacity !== undefined && input.capacity < slot.bookedCount) {
    throw new ApiError(409, "SLOT_CAPACITY_BELOW_BOOKINGS", "Capacity cannot be reduced below the current booked count.");
  }
  const store = await activeStore(slot.storeId.toString());
  const date = input.date ?? slot.date;
  const startTime = input.startTime ?? slot.startTime;
  const cutoffMinutes = input.cutoffMinutes ?? slot.cutoffMinutes;
  const startAt = zonedDateTimeToUtc(date, startTime, store.timezone);
  slot.set({
    ...input,
    timezone: store.timezone,
    cutoffAt: new Date(startAt.getTime() - cutoffMinutes * 60_000),
  });
  await slot.save();
  return slot;
}

export async function reservePickupSlotInSession(session: ClientSession, input: { slotId: string; storeId: string }) {
  const result = await PickupSlotModel.updateOne(
    {
      _id: new Types.ObjectId(input.slotId),
      storeId: new Types.ObjectId(input.storeId),
      status: "ACTIVE",
      cutoffAt: { $gt: new Date() },
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    },
    { $inc: { bookedCount: 1 } },
    { session },
  );
  if (result.modifiedCount !== 1) {
    throw new ApiError(409, "PICKUP_SLOT_FULL", "The selected pickup slot became unavailable. Choose another slot.");
  }
}

export async function releasePickupSlotInSession(session: ClientSession, slotId: Types.ObjectId) {
  await PickupSlotModel.updateOne(
    { _id: slotId, bookedCount: { $gt: 0 } },
    { $inc: { bookedCount: -1 } },
    { session },
  );
}

export async function listPickupOrders() {
  return OrderModel.find({ fulfillmentType: "PICKUP", orderStatus: "READY_FOR_PICKUP" })
    .sort({ "pickupSlot.date": 1, "pickupSlot.startTime": 1, createdAt: 1 })
    .lean();
}

export async function markOrderPickedUp(orderId: string, actor: PickupActor, note: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.fulfillmentType !== "PICKUP") throw new ApiError(409, "ORDER_NOT_PICKUP", "This order is not a pickup order.");
      if (order.orderStatus === "PICKED_UP") return;
      if (order.orderStatus !== "READY_FOR_PICKUP") {
        throw new ApiError(409, "PICKUP_STATUS_INVALID", "Order must be ready for pickup before it can be marked picked up.");
      }
      if (order.inventoryReservationStatus !== "COMMITTED") {
        throw new ApiError(409, "PICKUP_INVENTORY_NOT_COMMITTED", "Inventory must be committed before pickup completion.");
      }
      const previous = order.orderStatus;
      order.orderStatus = "PICKED_UP";
      order.fulfillmentSlotReservationStatus = "FULFILLED";
      await order.save({ session });
      const history = new OrderStatusHistoryModel({
        orderId: order._id,
        orderNumber: order.orderNumber,
        fromStatus: previous,
        toStatus: "PICKED_UP",
        actorType: "ADMIN",
        actorId: new Types.ObjectId(actor.adminUserId),
        actorRoleNames: actor.roleNames,
        note: note || "Order picked up by customer.",
      });
      await history.save({ session });
    });
  } finally {
    await session.endSession();
  }
  return OrderModel.findById(orderId).lean();
}
