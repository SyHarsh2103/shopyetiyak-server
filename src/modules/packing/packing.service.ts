import mongoose, { type ClientSession, Types } from "mongoose";
import type { z } from "zod";

import {
  commitInventoryInSession,
  type InventoryActor,
} from "../inventory/inventory.service.js";
import { OrderStatusHistoryModel } from "../orders/order-status-history.model.js";
import { OrderModel, type Order } from "../orders/order.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { paymentService } from "../payments/payment.service.js";
import { OrderSubstitutionModel } from "../substitutions/order-substitution.model.js";
import { ApiError } from "../../utils/api-error.js";
import { reconcileOrderValueRedemptionsForFulfillment } from "../customer-value/customer-value.service.js";
import { getFulfillmentOrderDetail, type FulfillmentActor } from "../picking/picking.service.js";
import type { completePackingSchema } from "./packing.validation.js";

type CompletePackingInput = z.infer<typeof completePackingSchema>;
type OrderItem = Order["items"][number];

export interface FulfillmentPaymentActions {
  capturePayment(
    paymentId: string,
    input: { idempotencyKey: string; amountMinor?: number },
  ): Promise<unknown>;
  refundPayment(
    paymentId: string,
    input: { idempotencyKey: string; amountMinor?: number; reason: string },
    actor: { adminUserId: string; roleNames: string[] },
  ): Promise<unknown>;
}

function inventoryActor(actor: FulfillmentActor): InventoryActor {
  return {
    adminUserId: actor.adminUserId,
    roleNames: actor.roleNames,
  };
}

function activeReservationQuantity(item: OrderItem): number {
  if (item.inventoryFulfillmentStatus === "RELEASED" || item.inventoryFulfillmentStatus === "COMMITTED") {
    return 0;
  }
  return item.reservedQuantity ?? item.requestedQuantity;
}

async function writeHistory(
  session: ClientSession,
  order: Order & { _id: Types.ObjectId },
  fromStatus: string,
  toStatus: string,
  actor: FulfillmentActor,
  note: string,
): Promise<void> {
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

export class PackingService {
  constructor(private readonly payments: FulfillmentPaymentActions = paymentService) {}

  private async settlePayment(orderId: string, actor: FulfillmentActor): Promise<void> {
    await reconcileOrderValueRedemptionsForFulfillment(orderId);
    const order = await OrderModel.findById(orderId).lean();
    if (!order) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
    }
    if (order.orderStatus !== "PACKING") {
      if (order.packing?.completedAt) {
        return;
      }
      throw new ApiError(409, "ORDER_NOT_IN_PACKING", "Complete picking before packing the order.");
    }

    const targetMinor = order.fulfillmentPricing?.totalMinor ?? order.pricing.totalMinor;
    if (targetMinor <= 0) {
      const prepaidMinor = order.fulfillmentPricing?.prepaidAmountMinor ?? order.pricing.prepaidAmountMinor ?? 0;
      if (prepaidMinor > 0) {
        return;
      }
      throw new ApiError(409, "ORDER_HAS_NO_FULFILLED_ITEMS", "An order with no fulfilled items must be cancelled instead of packed.");
    }

    let payment = await PaymentModel.findById(order.paymentId);
    if (!payment) {
      throw new ApiError(409, "ORDER_PAYMENT_MISSING", "This order is not linked to a payment record.");
    }

    if (payment.captureMethod === "MANUAL" && payment.status === "AUTHORIZED") {
      await this.payments.capturePayment(payment.id, {
        idempotencyKey: `phase10-pack-capture:${orderId}`,
        amountMinor: targetMinor,
      });
      payment = await PaymentModel.findById(order.paymentId);
      if (!payment) {
        throw new ApiError(409, "ORDER_PAYMENT_MISSING", "Payment record disappeared after capture.");
      }
    }

    if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw new ApiError(
        409,
        "FULFILLMENT_PAYMENT_NOT_CAPTURED",
        "Payment must be captured successfully before packing can commit inventory.",
      );
    }

    const netCapturedMinor = Math.max(0, payment.capturedAmountMinor - payment.refundedAmountMinor);
    if (netCapturedMinor < targetMinor) {
      throw new ApiError(
        409,
        "FULFILLMENT_PAYMENT_SHORTFALL",
        "The captured payment is below the final fulfillment total. Inventory was not committed.",
      );
    }

    if (netCapturedMinor > targetMinor) {
      const refundMinor = netCapturedMinor - targetMinor;
      await this.payments.refundPayment(
        payment.id,
        {
          idempotencyKey: `phase10-pack-refund:${orderId}`,
          amountMinor: refundMinor,
          reason: `Automatic fulfillment adjustment for order ${order.orderNumber}.`,
        },
        actor,
      );
    }
  }

  async completePacking(orderId: string, input: CompletePackingInput, actor: FulfillmentActor) {
    const existing = await OrderModel.findById(orderId).lean();
    if (!existing) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
    }
    if (existing.packing?.completedAt) {
      return getFulfillmentOrderDetail(orderId);
    }

    await this.settlePayment(orderId, actor);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await OrderModel.findById(orderId).session(session);
        if (!order) {
          throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
        }
        if (order.packing?.completedAt) {
          return;
        }
        if (order.orderStatus !== "PACKING") {
          throw new ApiError(409, "ORDER_NOT_IN_PACKING", "Complete picking before packing the order.");
        }

        const payment = await PaymentModel.findById(order.paymentId).session(session);
        if (!payment) {
          throw new ApiError(409, "ORDER_PAYMENT_MISSING", "This order is not linked to a payment record.");
        }
        const targetMinor = order.fulfillmentPricing?.totalMinor ?? order.pricing.totalMinor;
        const netCapturedMinor = Math.max(0, payment.capturedAmountMinor - payment.refundedAmountMinor);
        if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) || netCapturedMinor !== targetMinor) {
          throw new ApiError(
            409,
            "FULFILLMENT_PAYMENT_NOT_SETTLED",
            "The final captured payment must exactly match the fulfillment total before inventory is committed.",
          );
        }

        for (const item of order.items) {
          const status = item.fulfillmentStatus ?? "PENDING";
          if (status === "PENDING") {
            throw new ApiError(409, "PICKING_ITEMS_INCOMPLETE", "Every item must be resolved before packing is completed.");
          }

          if (status === "UNAVAILABLE") {
            item.inventoryFulfillmentStatus = "RELEASED";
            continue;
          }

          if (status === "PICKED") {
            const quantity = activeReservationQuantity(item);
            if (quantity <= 0) {
              throw new ApiError(409, "PICKED_ITEM_RESERVATION_MISSING", "A picked item no longer has an active inventory reservation.");
            }
            await commitInventoryInSession(
              session,
              {
                storeId: order.storeId.toString(),
                productId: item.productId.toString(),
                variantId: item.variantId.toString(),
                quantity,
                referenceType: "ORDER",
                referenceId: order._id.toString(),
                preferredBatchId: item.selectedBatch?.batchId?.toString() ?? null,
                note: `Committed picked inventory for order ${order.orderNumber}.`,
              },
              inventoryActor(actor),
            );
            item.reservedQuantity = 0;
            item.inventoryFulfillmentStatus = "COMMITTED";
            continue;
          }

          const substitution = await OrderSubstitutionModel.findOne({
            orderId: order._id,
            orderItemId: item._id,
            status: "ACTIVE",
          }).session(session);
          if (!substitution) {
            throw new ApiError(409, "SUBSTITUTION_RECORD_MISSING", "An active substitution record is required before packing can commit replacement inventory.");
          }
          await commitInventoryInSession(
            session,
            {
              storeId: order.storeId.toString(),
              productId: substitution.replacementProductId.toString(),
              variantId: substitution.replacementVariantId.toString(),
              quantity: substitution.reservedQuantity,
              referenceType: "ORDER",
              referenceId: order._id.toString(),
              preferredBatchId: substitution.selectedBatch?.batchId?.toString() ?? null,
              note: `Committed substitution inventory for order ${order.orderNumber}.`,
            },
            inventoryActor(actor),
          );
          substitution.reservedQuantity = 0;
          await substitution.save({ session });
          item.inventoryFulfillmentStatus = "COMMITTED";
        }

        const previous = order.orderStatus;
        const targetStatus = order.fulfillmentType === "PICKUP" ? "READY_FOR_PICKUP" : "READY";
        order.paymentStatus = payment.status;
        order.inventoryReservationStatus = "COMMITTED";
        order.packing = {
          bagCount: input.bagCount,
          notes: input.notes,
          completedAt: new Date(),
          completedByAdminId: new Types.ObjectId(actor.adminUserId),
        };
        order.orderStatus = targetStatus;
        await order.save({ session });
        await writeHistory(
          session,
          order,
          previous,
          targetStatus,
          actor,
          `Packing completed with ${input.bagCount} bag(s).${input.notes ? ` ${input.notes}` : ""}`,
        );
      });
    } finally {
      await session.endSession();
    }

    return getFulfillmentOrderDetail(orderId);
  }
}

export const packingService = new PackingService();

export async function listPackingOrders(page = 1, limit = 30) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const filter = { orderStatus: "PACKING" as const };
  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ "picking.completedAt": 1, createdAt: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  return {
    items: orders.map((order) => ({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      storeName: order.storeSnapshot.name,
      storeCode: order.storeSnapshot.code,
      fulfillmentType: order.fulfillmentType,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      itemCount: order.items.length,
      totalMinor: (order.fulfillmentPricing ?? order.pricing).totalMinor,
      currency: order.pricing.currency,
      pickingCompletedAt: order.picking?.completedAt?.toISOString() ?? null,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}
