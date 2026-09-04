import mongoose, {
  type ClientSession,
  Types,
} from "mongoose";
import { randomBytes } from "node:crypto";
import type { z } from "zod";

import { CartModel } from "../carts/cart.model.js";
import { CouponModel } from "../coupons/coupon.model.js";
import { CouponRedemptionModel } from "../coupons/coupon-redemption.model.js";
import {
  addCartItems,
  type CartOwner,
} from "../carts/cart.service.js";
import type { CheckoutReview } from "../checkout/checkout.service.js";
import {
  applyOrderValueRedemptionsInSession,
  awardLoyaltyForOrderInSession,
  reverseLoyaltyEarnForOrderInSession,
  reverseOrderValueRedemptionsInSession,
} from "../customer-value/customer-value.service.js";
import {
  releaseDeliverySlotInSession,
  reserveDeliverySlotInSession,
} from "../delivery/delivery.service.js";
import {
  releaseInventoryInSession,
  reserveInventoryInSession,
  type InventoryActor,
} from "../inventory/inventory.service.js";
import { PaymentModel } from "../payments/payment.model.js";
import { ProductModel } from "../products/product.model.js";
import {
  releasePickupSlotInSession,
  reservePickupSlotInSession,
} from "../pickup/pickup.service.js";
import { RefundModel } from "../payments/refund.model.js";
import { OrderSubstitutionModel } from "../substitutions/order-substitution.model.js";
import { ApiError } from "../../utils/api-error.js";
import { sha256 } from "../../utils/crypto.js";
import { OrderModel, type Order } from "./order.model.js";
import { OrderStatusHistoryModel } from "./order-status-history.model.js";
import type {
  adminOrderListQuerySchema,
  customerOrderListQuerySchema,
} from "./order.validation.js";

type AdminOrderListQuery = z.infer<
  typeof adminOrderListQuerySchema
>;

type CustomerOrderListQuery = z.infer<
  typeof customerOrderListQuerySchema
>;

export interface OrderActor {
  actorType: "ADMIN" | "CUSTOMER" | "SYSTEM" | "STRIPE";
  actorId?: string;
  roleNames?: string[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  customerId: string | null;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  store: {
    id: string;
    name: string;
    code: string;
    timezone: string;
  };
  paymentId: string;
  fulfillmentType: "DELIVERY" | "PICKUP";
  deliveryAddress: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    deliveryInstructions: string;
  } | null;
  deliveryZone: {
    id: string;
    name: string;
    minimumOrderMinor: number;
    deliveryFeeMinor: number;
    freeDeliveryThresholdMinor: number | null;
  } | null;
  deliverySlot: { id: string; date: string; startTime: string; endTime: string; timezone: string } | null;
  pickupSlot: { id: string; date: string; startTime: string; endTime: string; timezone: string } | null;
  fulfillmentSlotReservationStatus: string;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    productName: string;
    productSlug: string;
    sku: string;
    productType: string;
    sellingUnit: string;
    unitQuantity: number;
    attributes: Array<{
      name: string;
      value: string;
    }>;
    image: {
      url: string;
      altText: string;
    } | null;
    requestedQuantity: number;
    requestedWeight: number | null;
    actualWeight: number | null;
    pickedQuantity: number | null;
    reservedQuantity: number;
    fulfillmentStatus: string;
    inventoryFulfillmentStatus: string;
    fulfilledUnitPriceMinor: number;
    fulfilledLineSubtotalMinor: number;
    fulfilledDiscountMinor: number;
    fulfilledTaxMinor: number;
    fulfilledLineMinor: number;
    unitPriceMinor: number;
    lineSubtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    finalLineMinor: number;
    substitutionPreference: string;
  }>;
  pricing: {
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    deliveryFeeMinor: number;
    prepaidAmountMinor: number;
    totalMinor: number;
  };
  fulfillmentPricing: {
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    deliveryFeeMinor: number;
    prepaidAmountMinor: number;
    totalMinor: number;
  };
  picking: {
    startedAt: string | null;
    completedAt: string | null;
  };
  packing: {
    bagCount: number;
    notes: string;
    completedAt: string | null;
  };
  coupon: {
    code: string;
    discountMinor: number;
  };
  customerValue: {
    loyaltyPointsRedeemed: number;
    loyaltyMinor: number;
    storeCreditMinor: number;
    giftCardLastFour: string;
    giftCardMinor: number;
    totalMinor: number;
    loyaltyPointsEarned: number;
    redemptionsReversedAt: string | null;
    loyaltyEarnReversedAt: string | null;
  };
  paymentStatus: string;
  orderStatus: string;
  inventoryReservationStatus: string;
  customerNotes: string;
  cancellation: {
    reason: string;
    cancelledAt: string | null;
    actorType: string | null;
    actorId: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummary {
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    actorId: string | null;
    actorRoleNames: string[];
    note: string;
    createdAt: string;
  }>;
  substitutions: Array<{
    id: string;
    orderItemId: string;
    replacementProductName: string;
    replacementSku: string;
    replacementQuantity: number;
    replacementFinalLineMinor: number;
    customerApproved: boolean;
    reason: string;
    status: string;
  }>;
  payment: {
    id: string;
    provider: string;
    providerPaymentIntentId: string;
    currency: string;
    amountMinor: number;
    authorizedAmountMinor: number;
    capturedAmountMinor: number;
    refundedAmountMinor: number;
    captureMethod: string;
    status: string;
    lastError: {
      code: string;
      message: string;
    } | null;
  } | null;
  refunds: Array<{
    id: string;
    providerRefundId: string;
    amountMinor: number;
    currency: string;
    status: string;
    reason: string;
    failureReason: string;
    createdAt: string;
  }>;
}

function orderNumber(): string {
  const now = new Date();

  const date = [
    now.getUTCFullYear().toString(),
    (now.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0"),
    now
      .getUTCDate()
      .toString()
      .padStart(2, "0"),
  ].join("");

  return `GR-${date}-${randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function actorObjectId(
  actor: OrderActor,
): Types.ObjectId | null {
  return actor.actorId
    ? new Types.ObjectId(actor.actorId)
    : null;
}

function inventoryActor(
  actor: OrderActor,
): InventoryActor | undefined {
  if (actor.actorType !== "ADMIN") {
    return undefined;
  }

  return {
    adminUserId: actor.actorId,
    roleNames: actor.roleNames,
  };
}

function ownerFilter(
  owner: CartOwner,
): Record<string, unknown> {
  if (owner.customerId) {
    return {
      customerId: new Types.ObjectId(
        owner.customerId,
      ),
    };
  }

  if (!owner.guestToken) {
    throw new ApiError(
      401,
      "ORDER_OWNER_REQUIRED",
      "A valid customer or guest checkout session is required.",
    );
  }

  return {
    guestTokenHash: sha256(
      owner.guestToken,
    ),
  };
}

function serializeOrder(
  order: Order & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  },
): OrderSummary {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customerId:
      order.customerId?.toString() ??
      null,

    contact: {
      firstName:
        order.contactSnapshot.firstName,
      lastName:
        order.contactSnapshot.lastName,
      email:
        order.contactSnapshot.email,
      phone:
        order.contactSnapshot.phone,
    },

    store: {
      id:
        order.storeSnapshot.storeId.toString(),
      name:
        order.storeSnapshot.name,
      code:
        order.storeSnapshot.code,
      timezone:
        order.storeSnapshot.timezone,
    },

    paymentId:
      order.paymentId.toString(),

    fulfillmentType:
      order.fulfillmentType,

    deliveryAddress:
      order.deliveryAddress
        ? {
            recipientName:
              order.deliveryAddress.recipientName,
            phone:
              order.deliveryAddress.phone,
            line1:
              order.deliveryAddress.line1,
            line2:
              order.deliveryAddress.line2,
            city:
              order.deliveryAddress.city,
            state:
              order.deliveryAddress.state,
            postalCode:
              order.deliveryAddress.postalCode,
            country:
              order.deliveryAddress.country,
            deliveryInstructions:
              order.deliveryAddress.deliveryInstructions,
          }
        : null,

    deliveryZone: order.deliveryZone
      ? {
          id: order.deliveryZone.zoneId.toString(),
          name: order.deliveryZone.name,
          minimumOrderMinor: order.deliveryZone.minimumOrderMinor,
          deliveryFeeMinor: order.deliveryZone.deliveryFeeMinor,
          freeDeliveryThresholdMinor: order.deliveryZone.freeDeliveryThresholdMinor ?? null,
        }
      : null,

    deliverySlot: order.deliverySlot
      ? {
          id: order.deliverySlot.slotId.toString(),
          date: order.deliverySlot.date,
          startTime: order.deliverySlot.startTime,
          endTime: order.deliverySlot.endTime,
          timezone: order.deliverySlot.timezone,
        }
      : null,

    pickupSlot: order.pickupSlot
      ? {
          id: order.pickupSlot.slotId.toString(),
          date: order.pickupSlot.date,
          startTime: order.pickupSlot.startTime,
          endTime: order.pickupSlot.endTime,
          timezone: order.pickupSlot.timezone,
        }
      : null,

    fulfillmentSlotReservationStatus: order.fulfillmentSlotReservationStatus ?? "ACTIVE",

    items: order.items.map((item) => ({
      id:
        item._id.toString(),
      productId:
        item.productId.toString(),
      variantId:
        item.variantId.toString(),
      productName:
        item.productNameSnapshot,
      productSlug:
        item.productSlugSnapshot,
      sku:
        item.skuSnapshot,
      productType:
        item.productTypeSnapshot,
      sellingUnit:
        item.sellingUnitSnapshot,
      unitQuantity:
        item.unitQuantitySnapshot,
      attributes:
        item.attributesSnapshot.map(
          (attribute) => ({
            name:
              attribute.name,
            value:
              attribute.value,
          }),
        ),
      image:
        item.imageSnapshot
          ? {
              url:
                item.imageSnapshot.url,
              altText:
                item.imageSnapshot.altText,
            }
          : null,
      requestedQuantity:
        item.requestedQuantity,
      requestedWeight:
        item.requestedWeight ??
        null,
      actualWeight:
        item.actualWeight ??
        null,
      pickedQuantity:
        item.pickedQuantity ??
        null,
      reservedQuantity:
        item.reservedQuantity ??
        item.requestedQuantity,
      fulfillmentStatus:
        item.fulfillmentStatus ??
        "PENDING",
      inventoryFulfillmentStatus:
        item.inventoryFulfillmentStatus ??
        "RESERVED",
      fulfilledUnitPriceMinor:
        item.fulfilledUnitPriceMinor ??
        item.unitPriceMinor,
      fulfilledLineSubtotalMinor:
        item.fulfilledLineSubtotalMinor ??
        item.lineSubtotalMinor,
      fulfilledDiscountMinor:
        item.fulfilledDiscountMinor ??
        item.discountMinor,
      fulfilledTaxMinor:
        item.fulfilledTaxMinor ??
        item.taxMinor,
      fulfilledLineMinor:
        item.fulfilledLineMinor ??
        item.finalLineMinor,
      unitPriceMinor:
        item.unitPriceMinor,
      lineSubtotalMinor:
        item.lineSubtotalMinor,
      discountMinor:
        item.discountMinor,
      taxMinor:
        item.taxMinor,
      finalLineMinor:
        item.finalLineMinor,
      substitutionPreference:
        item.substitutionPreference,
    })),

    pricing: {
      currency:
        order.pricing.currency,
      subtotalMinor:
        order.pricing.subtotalMinor,
      discountMinor:
        order.pricing.discountMinor,
      taxMinor:
        order.pricing.taxMinor,
      deliveryFeeMinor:
        order.pricing.deliveryFeeMinor,
      prepaidAmountMinor:
        order.pricing.prepaidAmountMinor ?? 0,
      totalMinor:
        order.pricing.totalMinor,
    },

    fulfillmentPricing: {
      currency:
        (order.fulfillmentPricing ?? order.pricing).currency,
      subtotalMinor:
        (order.fulfillmentPricing ?? order.pricing).subtotalMinor,
      discountMinor:
        (order.fulfillmentPricing ?? order.pricing).discountMinor,
      taxMinor:
        (order.fulfillmentPricing ?? order.pricing).taxMinor,
      deliveryFeeMinor:
        (order.fulfillmentPricing ?? order.pricing).deliveryFeeMinor,
      prepaidAmountMinor:
        (order.fulfillmentPricing ?? order.pricing).prepaidAmountMinor ?? 0,
      totalMinor:
        (order.fulfillmentPricing ?? order.pricing).totalMinor,
    },

    picking: {
      startedAt:
        order.picking?.startedAt?.toISOString() ??
        null,
      completedAt:
        order.picking?.completedAt?.toISOString() ??
        null,
    },

    packing: {
      bagCount:
        order.packing?.bagCount ??
        0,
      notes:
        order.packing?.notes ??
        "",
      completedAt:
        order.packing?.completedAt?.toISOString() ??
        null,
    },

    coupon: {
      code:
        order.couponSnapshot.code,
      discountMinor:
        order.couponSnapshot.discountMinor,
    },

    customerValue: {
      loyaltyPointsRedeemed: order.customerValueSnapshot?.loyaltyPointsRedeemed ?? 0,
      loyaltyMinor: order.customerValueSnapshot?.loyaltyMinor ?? 0,
      storeCreditMinor: order.customerValueSnapshot?.storeCreditMinor ?? 0,
      giftCardLastFour: order.customerValueSnapshot?.giftCardLastFour ?? "",
      giftCardMinor: order.customerValueSnapshot?.giftCardMinor ?? 0,
      totalMinor: order.customerValueSnapshot?.totalMinor ?? 0,
      loyaltyPointsEarned: order.customerValueSnapshot?.loyaltyPointsEarned ?? 0,
      redemptionsReversedAt: order.customerValueSnapshot?.redemptionsReversedAt?.toISOString() ?? null,
      loyaltyEarnReversedAt: order.customerValueSnapshot?.loyaltyEarnReversedAt?.toISOString() ?? null,
    },

    paymentStatus:
      order.paymentStatus,

    orderStatus:
      order.orderStatus,

    inventoryReservationStatus:
      order.inventoryReservationStatus,

    customerNotes:
      order.customerNotes,

    cancellation:
      order.cancellation
        ? {
            reason:
              order.cancellation.reason,
            cancelledAt:
              order.cancellation.cancelledAt?.toISOString() ??
              null,
            actorType:
              order.cancellation.actorType ??
              null,
            actorId:
              order.cancellation.actorId?.toString() ??
              null,
          }
        : null,

    createdAt:
      order.createdAt.toISOString(),

    updatedAt:
      order.updatedAt.toISOString(),
  };
}

async function historyForOrder(
  orderId: Types.ObjectId,
) {
  const history =
    await OrderStatusHistoryModel.find({
      orderId,
    }).sort({
      createdAt: 1,
    });

  return history.map((entry) => ({
    id:
      entry.id,
    fromStatus:
      entry.fromStatus ??
      null,
    toStatus:
      entry.toStatus,
    actorType:
      entry.actorType,
    actorId:
      entry.actorId?.toString() ??
      null,
    actorRoleNames:
      entry.actorRoleNames,
    note:
      entry.note,
    createdAt:
      entry.createdAt.toISOString(),
  }));
}

async function detailForOrder(
  order: Order & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<OrderDetail> {
  const [
    history,
    payment,
    refunds,
    substitutions,
  ] = await Promise.all([
    historyForOrder(order._id),

    PaymentModel.findById(
      order.paymentId,
    ),

    RefundModel.find({
      paymentId: order.paymentId,
    }).sort({
      createdAt: -1,
    }),

    OrderSubstitutionModel.find({
      orderId: order._id,
    }).sort({
      createdAt: 1,
    }),
  ]);

  return {
    ...serializeOrder(order),

    history,

    substitutions:
      substitutions.map(
        (entry) => ({
          id:
            entry.id,

          orderItemId:
            entry.orderItemId.toString(),

          replacementProductName:
            entry.replacementProductNameSnapshot,

          replacementSku:
            entry.replacementSkuSnapshot,

          replacementQuantity:
            entry.replacementQuantity,

          replacementFinalLineMinor:
            entry.replacementFinalLineMinor,

          customerApproved:
            entry.customerApproved,

          reason:
            entry.reason,

          status:
            entry.status,
        }),
      ),

    payment:
      payment
        ? {
            id:
              payment.id,

            provider:
              payment.provider,

            providerPaymentIntentId:
              payment.providerPaymentIntentId ??
              "",

            currency:
              payment.currency,

            amountMinor:
              payment.amountMinor,

            authorizedAmountMinor:
              payment.authorizedAmountMinor,

            capturedAmountMinor:
              payment.capturedAmountMinor,

            refundedAmountMinor:
              payment.refundedAmountMinor,

            captureMethod:
              payment.captureMethod,

            status:
              payment.status,

            lastError:
              payment.lastError
                ? {
                    code:
                      payment.lastError.code,

                    message:
                      payment.lastError.message,
                  }
                : null,
          }
        : null,

    refunds:
      refunds.map((refund) => ({
        id:
          refund.id,

        providerRefundId:
          refund.providerRefundId ??
          "",

        amountMinor:
          refund.amountMinor,

        currency:
          refund.currency,

        status:
          refund.status,

        reason:
          refund.reason,

        failureReason:
          refund.failureReason,

        createdAt:
          refund.createdAt.toISOString(),
      })),
  };
}

function discountAllocations(
  review: CheckoutReview,
): Map<string, number> {
  const result =
    new Map<string, number>();

  const lines =
    review.cart.items;

  let allocated = 0;

  lines.forEach(
    (item, index) => {
      const key =
        `${item.productId}:${item.variantId}`;

      const amount =
        index ===
        lines.length - 1
          ? Math.max(
              0,
              review.totals.discountMinor -
                allocated,
            )
          : review.totals.subtotalMinor > 0
            ? Math.floor(
                (
                  review.totals.discountMinor *
                  item.lineSubtotalMinor
                ) /
                  review.totals.subtotalMinor,
              )
            : 0;

      allocated += amount;

      result.set(
        key,
        amount,
      );
    },
  );

  return result;
}

async function writeHistory(
  session: ClientSession,
  input: {
    orderId: Types.ObjectId;
    orderNumber: string;
    fromStatus: string | null;
    toStatus: string;
    actor: OrderActor;
    note?: string;
  },
): Promise<void> {
  const history =
    new OrderStatusHistoryModel({
      orderId:
        input.orderId,

      orderNumber:
        input.orderNumber,

      fromStatus:
        input.fromStatus,

      toStatus:
        input.toStatus,

      actorType:
        input.actor.actorType,

      actorId:
        actorObjectId(
          input.actor,
        ),

      actorRoleNames:
        input.actor.roleNames ??
        [],

      note:
        input.note ??
        "",
    });

  await history.save({
    session,
  });
}


async function releaseFulfillmentSlotInSession(
  session: ClientSession,
  order: Order & { _id: Types.ObjectId },
): Promise<void> {
  if ((order.fulfillmentSlotReservationStatus ?? "ACTIVE") !== "ACTIVE") return;
  if (order.fulfillmentType === "DELIVERY" && order.deliverySlot?.slotId) {
    await releaseDeliverySlotInSession(session, order.deliverySlot.slotId);
  } else if (order.fulfillmentType === "PICKUP" && order.pickupSlot?.slotId) {
    await releasePickupSlotInSession(session, order.pickupSlot.slotId);
  }
  order.fulfillmentSlotReservationStatus = "RELEASED";
}

async function releaseReservationInSession(
  session: ClientSession,
  order: Order & {
    _id: Types.ObjectId;
  },
  actor: OrderActor,
  note: string,
): Promise<void> {
  if (order.inventoryReservationStatus === "ACTIVE") {
    for (const item of order.items) {
    if (
      item.fulfillmentStatus ===
        "SUBSTITUTED" &&
      item.substitutionId
    ) {
      const substitution =
        await OrderSubstitutionModel.findOne({
          _id:
            item.substitutionId,

          orderId:
            order._id,

          status:
            "ACTIVE",
        }).session(session);

      const replacementReserved =
        substitution?.reservedQuantity ??
        0;

      if (
        substitution &&
        replacementReserved > 0
      ) {
        await releaseInventoryInSession(
          session,
          {
            storeId:
              order.storeId.toString(),

            productId:
              substitution.replacementProductId.toString(),

            variantId:
              substitution.replacementVariantId.toString(),

            quantity:
              replacementReserved,

            referenceType:
              "ORDER",

            referenceId:
              order._id.toString(),

            note,
          },
          inventoryActor(actor),
        );

        substitution.reservedQuantity =
          0;

        substitution.status =
          "CANCELLED";

        await substitution.save({
          session,
        });
      }

      item.reservedQuantity =
        0;

      item.inventoryFulfillmentStatus =
        "RELEASED";

      continue;
    }

    if (
      item.inventoryFulfillmentStatus ===
        "RELEASED" ||
      item.inventoryFulfillmentStatus ===
        "COMMITTED"
    ) {
      continue;
    }

    const quantity =
      item.reservedQuantity ??
      item.requestedQuantity;

    if (quantity > 0) {
      await releaseInventoryInSession(
        session,
        {
          storeId:
            order.storeId.toString(),

          productId:
            item.productId.toString(),

          variantId:
            item.variantId.toString(),

          quantity,

          referenceType:
            "ORDER",

          referenceId:
            order._id.toString(),

          note,
        },
        inventoryActor(actor),
      );
    }

    item.reservedQuantity =
      0;

    item.inventoryFulfillmentStatus =
      "RELEASED";
  }

    order.inventoryReservationStatus =
      "RELEASED";
  }

  await releaseFulfillmentSlotInSession(session, order);
}

export async function ensureOrderForPayment(
  paymentId: string,
  owner: CartOwner,
  review: CheckoutReview,
): Promise<OrderSummary> {
  const existing =
    await OrderModel.findOne({
      paymentId,
    });

  if (
    existing &&
    !(
      existing.inventoryReservationStatus ===
        "RELEASED" &&
      existing.orderStatus ===
        "PAYMENT_FAILED"
    )
  ) {
    return serializeOrder(
      existing,
    );
  }

  const session =
    await mongoose.startSession();

  let createdOrder:
    OrderSummary | null =
    null;

  try {
    await session.withTransaction(
      async () => {
        const insideExisting =
          await OrderModel.findOne({
            paymentId,
          }).session(session);

        if (insideExisting) {
          if (
            insideExisting.inventoryReservationStatus ===
              "RELEASED" &&
            insideExisting.orderStatus ===
              "PAYMENT_FAILED"
          ) {
            for (
              const item of review.cart.items
            ) {
              await reserveInventoryInSession(
                session,
                {
                  storeId:
                    review.fulfillment.store.id,

                  productId:
                    item.productId,

                  variantId:
                    item.variantId,

                  quantity:
                    item.quantity,

                  referenceType:
                    "ORDER",

                  referenceId:
                    insideExisting._id.toString(),

                  note:
                    `Re-reserved for payment retry on order ${insideExisting.orderNumber}.`,
                },
              );

              const orderItem =
                insideExisting.items.find(
                  (candidate) =>
                    candidate.productId.toString() ===
                      item.productId &&
                    candidate.variantId.toString() ===
                      item.variantId,
                );

              if (!orderItem) {
                throw new ApiError(
                  409,
                  "ORDER_RETRY_ITEM_MISMATCH",
                  "The order no longer matches the checkout being retried.",
                );
              }

              orderItem.reservedQuantity =
                item.quantity;

              orderItem.inventoryFulfillmentStatus =
                "RESERVED";

              orderItem.fulfillmentStatus =
                "PENDING";

              orderItem.pickedQuantity =
                null;

              orderItem.actualWeight =
                null;

              orderItem.selectedBatch =
                null;

              orderItem.fulfilledUnitPriceMinor =
                orderItem.unitPriceMinor;

              orderItem.fulfilledLineSubtotalMinor =
                orderItem.lineSubtotalMinor;

              orderItem.fulfilledDiscountMinor =
                orderItem.discountMinor;

              orderItem.fulfilledTaxMinor =
                orderItem.taxMinor;

              orderItem.fulfilledLineMinor =
                orderItem.finalLineMinor;
            }

            if ((insideExisting.fulfillmentSlotReservationStatus ?? "RELEASED") === "RELEASED") {
              if (insideExisting.fulfillmentType === "DELIVERY" && insideExisting.deliverySlot?.slotId && insideExisting.deliveryZone?.zoneId) {
                await reserveDeliverySlotInSession(session, {
                  slotId: insideExisting.deliverySlot.slotId.toString(),
                  storeId: insideExisting.storeId.toString(),
                  zoneId: insideExisting.deliveryZone.zoneId.toString(),
                });
              } else if (insideExisting.fulfillmentType === "PICKUP" && insideExisting.pickupSlot?.slotId) {
                await reservePickupSlotInSession(session, {
                  slotId: insideExisting.pickupSlot.slotId.toString(),
                  storeId: insideExisting.storeId.toString(),
                });
              }
              insideExisting.fulfillmentSlotReservationStatus = "ACTIVE";
            }

            const previous =
              insideExisting.orderStatus;

            insideExisting.inventoryReservationStatus =
              "ACTIVE";

            insideExisting.paymentStatus =
              "PENDING";

            insideExisting.orderStatus =
              "PENDING_PAYMENT";

            insideExisting.fulfillmentPricing = {
              currency:
                insideExisting.pricing.currency,

              subtotalMinor:
                insideExisting.pricing.subtotalMinor,

              discountMinor:
                insideExisting.pricing.discountMinor,

              taxMinor:
                insideExisting.pricing.taxMinor,

              deliveryFeeMinor:
                insideExisting.pricing.deliveryFeeMinor,

              prepaidAmountMinor:
                insideExisting.pricing.prepaidAmountMinor ?? 0,

              totalMinor:
                insideExisting.pricing.totalMinor,
            };

            if (review.valueRedemptions.totalMinor > 0 && insideExisting.customerValueSnapshot?.redemptionsReversedAt) {
              await applyOrderValueRedemptionsInSession(session, {
                orderId: insideExisting._id,
                customerId: insideExisting.customerId ?? null,
                currency: insideExisting.pricing.currency,
                redemptions: review.valueRedemptions,
              });
              insideExisting.customerValueSnapshot.redemptionsReversedAt = null;
            }

            await insideExisting.save({
              session,
            });

            await PaymentModel.updateOne(
              {
                _id:
                  new Types.ObjectId(
                    paymentId,
                  ),
              },
              {
                $set: {
                  status:
                    "PENDING",

                  lastError:
                    null,
                },
              },
              {
                session,
              },
            );

            await writeHistory(
              session,
              {
                orderId:
                  insideExisting._id,

                orderNumber:
                  insideExisting.orderNumber,

                fromStatus:
                  previous,

                toStatus:
                  "PENDING_PAYMENT",

                actor: {
                  actorType:
                    "SYSTEM",
                },

                note:
                  "Payment retry started and inventory was reserved again.",
              },
            );
          }

          createdOrder =
            serializeOrder(
              insideExisting,
            );

          return;
        }

        const payment =
          await PaymentModel.findById(
            paymentId,
          ).session(session);

        if (!payment) {
          throw new ApiError(
            404,
            "PAYMENT_NOT_FOUND",
            "Payment record was not found.",
          );
        }

        const orderId =
          new Types.ObjectId();

        const number =
          orderNumber();

        const discounts =
          discountAllocations(
            review,
          );

        const taxMap =
          new Map(
            review.tax.lines.map(
              (line) => [
                `${line.productId}:${line.variantId}`,
                line,
              ],
            ),
          );

        const costProducts =
          await ProductModel.find({
            _id: {
              $in: review.cart.items.map(
                (item) => new Types.ObjectId(item.productId),
              ),
            },
          })
            .select({ variants: 1 })
            .session(session)
            .lean();

        const costMap = new Map<string, number>();
        for (const product of costProducts) {
          for (const variant of product.variants) {
            costMap.set(
              `${product._id.toString()}:${variant._id.toString()}`,
              variant.pricing.costPriceMinor,
            );
          }
        }

        const itemSnapshots =
          review.cart.items.map(
            (item) => {
              if (!item.product) {
                throw new ApiError(
                  409,
                  "ORDER_ITEM_NOT_AVAILABLE",
                  "A cart item became unavailable before order creation.",
                );
              }

              const key =
                `${item.productId}:${item.variantId}`;

              const discountMinor =
                discounts.get(
                  key,
                ) ?? 0;

              const taxMinor =
                taxMap.get(key)
                  ?.taxMinor ??
                0;

              const finalLineMinor =
                Math.max(
                  0,
                  item.lineSubtotalMinor -
                    discountMinor +
                    taxMinor,
                );

              return {
                productId:
                  new Types.ObjectId(
                    item.productId,
                  ),

                variantId:
                  new Types.ObjectId(
                    item.variantId,
                  ),

                productNameSnapshot:
                  item.product.name,

                productSlugSnapshot:
                  item.product.slug,

                skuSnapshot:
                  item.product.variant.sku,

                productTypeSnapshot:
                  item.product.productType,

                sellingUnitSnapshot:
                  item.product.variant.sellingUnit,

                unitQuantitySnapshot:
                  item.product.variant.unitQuantity,

                attributesSnapshot:
                  item.product.variant.attributes,

                imageSnapshot:
                  item.product.primaryImage,

                requestedQuantity:
                  item.quantity,

                requestedWeight:
                  item.product.productType ===
                  "VARIABLE_WEIGHT"
                    ? item.quantity
                    : null,

                actualWeight:
                  null,

                pickedQuantity:
                  null,

                reservedQuantity:
                  item.quantity,

                fulfillmentStatus:
                  "PENDING",

                inventoryFulfillmentStatus:
                  "RESERVED",

                selectedBatch:
                  null,

                unitPriceMinor:
                  item.product.variant.pricing.currentPriceMinor,

                costPriceMinorSnapshot:
                  costMap.get(key) ?? null,

                lineSubtotalMinor:
                  item.lineSubtotalMinor,

                discountMinor,

                taxMinor,

                finalLineMinor,

                fulfilledUnitPriceMinor:
                  item.product.variant.pricing.currentPriceMinor,

                fulfilledLineSubtotalMinor:
                  item.lineSubtotalMinor,

                fulfilledDiscountMinor:
                  discountMinor,

                fulfilledTaxMinor:
                  taxMinor,

                fulfilledLineMinor:
                  finalLineMinor,

                substitutionPreference:
                  review.substitutionPreferences.find(
                    (preference) =>
                      preference.productId ===
                        item.productId &&
                      preference.variantId ===
                        item.variantId,
                  )?.preference ??
                  "BEST_AVAILABLE",
              };
            },
          );

        for (
          const item of review.cart.items
        ) {
          await reserveInventoryInSession(
            session,
            {
              storeId:
                review.fulfillment.store.id,

              productId:
                item.productId,

              variantId:
                item.variantId,

              quantity:
                item.quantity,

              referenceType:
                "ORDER",

              referenceId:
                orderId.toString(),

              note:
                `Reserved for order ${number}.`,
            },
          );
        }

        const selectedSlot = review.fulfillment.slot.selected;
        if (!selectedSlot) {
          throw new ApiError(409, "FULFILLMENT_SLOT_REQUIRED", "A delivery or pickup slot is required before order creation.");
        }
        if (review.fulfillment.type === "DELIVERY") {
          const zone = review.fulfillment.deliveryZone;
          if (!zone) throw new ApiError(409, "DELIVERY_ZONE_REQUIRED", "A delivery zone is required before order creation.");
          await reserveDeliverySlotInSession(session, {
            slotId: selectedSlot.id,
            storeId: review.fulfillment.store.id,
            zoneId: zone.id,
          });
        } else {
          await reservePickupSlotInSession(session, {
            slotId: selectedSlot.id,
            storeId: review.fulfillment.store.id,
          });
        }

        await applyOrderValueRedemptionsInSession(session, {
          orderId,
          customerId: review.identity.customerId ? new Types.ObjectId(review.identity.customerId) : null,
          currency: review.totals.currency,
          redemptions: review.valueRedemptions,
        });

        const contact =
          review.identity.contact;

        const guestTokenHash =
          !review.identity.customerId &&
          owner.guestToken
            ? sha256(
                owner.guestToken,
              )
            : null;

        const created =
          await OrderModel.create(
            [
              {
                _id:
                  orderId,

                orderNumber:
                  number,

                customerId:
                  review.identity.customerId
                    ? new Types.ObjectId(
                        review.identity.customerId,
                      )
                    : null,

                guestTokenHash,

                guestCustomer:
                  review.identity.kind ===
                  "GUEST"
                    ? contact
                    : null,

                contactSnapshot:
                  contact,

                storeId:
                  new Types.ObjectId(
                    review.fulfillment.store.id,
                  ),

                storeSnapshot: {
                  storeId:
                    new Types.ObjectId(
                      review.fulfillment.store.id,
                    ),

                  name:
                    review.fulfillment.store.name,

                  code:
                    review.fulfillment.store.code,

                  timezone:
                    review.fulfillment.store.timezone,
                },

                cartId:
                  review.cart.id
                    ? new Types.ObjectId(
                        review.cart.id,
                      )
                    : null,

                paymentId:
                  payment._id,

                fulfillmentType:
                  review.fulfillment.type,

                deliveryAddress:
                  review.fulfillment.deliveryAddress,

                deliveryZone: review.fulfillment.deliveryZone
                  ? {
                      zoneId: new Types.ObjectId(review.fulfillment.deliveryZone.id),
                      name: review.fulfillment.deliveryZone.name,
                      minimumOrderMinor: review.fulfillment.deliveryZone.minimumOrderMinor,
                      deliveryFeeMinor: review.fulfillment.deliveryZone.deliveryFeeMinor,
                      freeDeliveryThresholdMinor: review.fulfillment.deliveryZone.freeDeliveryThresholdMinor,
                    }
                  : null,

                deliverySlot: review.fulfillment.type === "DELIVERY" && selectedSlot
                  ? {
                      slotId: new Types.ObjectId(selectedSlot.id),
                      date: selectedSlot.date,
                      startTime: selectedSlot.startTime,
                      endTime: selectedSlot.endTime,
                      timezone: selectedSlot.timezone,
                    }
                  : null,

                pickupSlot: review.fulfillment.type === "PICKUP" && selectedSlot
                  ? {
                      slotId: new Types.ObjectId(selectedSlot.id),
                      date: selectedSlot.date,
                      startTime: selectedSlot.startTime,
                      endTime: selectedSlot.endTime,
                      timezone: selectedSlot.timezone,
                    }
                  : null,

                fulfillmentSlotReservationStatus:
                  "ACTIVE",

                items:
                  itemSnapshots,

                pricing: {
                  currency: review.totals.currency,
                  subtotalMinor: review.totals.subtotalMinor,
                  discountMinor: review.totals.discountMinor,
                  taxMinor: review.totals.taxMinor,
                  deliveryFeeMinor: review.totals.deliveryFeeMinor,
                  prepaidAmountMinor: review.valueRedemptions.totalMinor,
                  totalMinor: review.totals.totalMinor,
                },

                fulfillmentPricing: {
                  currency: review.totals.currency,
                  subtotalMinor: review.totals.subtotalMinor,
                  discountMinor: review.totals.discountMinor,
                  taxMinor: review.totals.taxMinor,
                  deliveryFeeMinor: review.totals.deliveryFeeMinor,
                  prepaidAmountMinor: review.valueRedemptions.totalMinor,
                  totalMinor: review.totals.totalMinor,
                },

                customerValueSnapshot: review.valueRedemptions.totalMinor > 0
                  ? {
                      loyaltyPointsRedeemed: review.valueRedemptions.loyaltyPoints,
                      loyaltyMinor: review.valueRedemptions.loyaltyMinor,
                      storeCreditMinor: review.valueRedemptions.storeCreditMinor,
                      giftCardId: review.valueRedemptions.giftCardId ? new Types.ObjectId(review.valueRedemptions.giftCardId) : null,
                      giftCardLastFour: review.valueRedemptions.giftCardLastFour,
                      giftCardMinor: review.valueRedemptions.giftCardMinor,
                      totalMinor: review.valueRedemptions.totalMinor,
                      loyaltyPointsEarned: 0,
                      loyaltyPointsRestored: 0,
                      storeCreditRestoredMinor: 0,
                      giftCardRestoredMinor: 0,
                      fulfillmentRestoredMinor: 0,
                      fulfillmentReconciledAt: null,
                      redemptionsReversedAt: null,
                      loyaltyEarnReversedAt: null,
                    }
                  : null,

                couponSnapshot: {
                  code:
                    review.cart.coupon.valid
                      ? review.cart.coupon.code
                      : "",

                  discountMinor:
                    review.totals.discountMinor,
                },

                taxLinesSnapshot:
                  review.tax.lines.map(
                    (line) => ({
                      productId:
                        new Types.ObjectId(
                          line.productId,
                        ),

                      variantId:
                        new Types.ObjectId(
                          line.variantId,
                        ),

                      taxableAmountMinor:
                        line.taxableAmountMinor,

                      taxMinor:
                        line.taxMinor,

                      rateBasisPoints:
                        line.rateBasisPoints,

                      ruleId:
                        line.ruleId
                          ? new Types.ObjectId(
                              line.ruleId,
                            )
                          : null,
                    }),
                  ),

                paymentStatus:
                  payment.status,

                orderStatus:
                  "PENDING_PAYMENT",

                inventoryReservationStatus:
                  "ACTIVE",

                customerNotes:
                  review.customerNotes,
              },
            ],
            {
              session,
            },
          );

        const order =
          created[0];

        if (!order) {
          throw new Error(
            "Order creation completed without an order record.",
          );
        }

        const paymentUpdate =
          await PaymentModel.updateOne(
            {
              _id:
                payment._id,

              $or: [
                {
                  orderId:
                    null,
                },
                {
                  orderId: {
                    $exists:
                      false,
                  },
                },
              ],
            },
            {
              $set: {
                orderId:
                  order._id,
              },
            },
            {
              session,
            },
          );

        if (
          paymentUpdate.modifiedCount !==
          1
        ) {
          throw new ApiError(
            409,
            "PAYMENT_ALREADY_LINKED_TO_ORDER",
            "This payment is already linked to another order.",
          );
        }

        if (review.cart.coupon.valid && review.cart.coupon.code) {
          const coupon = await CouponModel.findOne({ code: review.cart.coupon.code }).session(session);
          if (coupon) {
            await CouponRedemptionModel.updateOne(
              { couponId: coupon._id, orderId: order._id },
              { $setOnInsert: {
                couponId: coupon._id,
                code: coupon.code,
                orderId: order._id,
                customerId: order.customerId ?? null,
                discountMinor: review.cart.coupon.discountMinor,
                currency: review.totals.currency,
              } },
              { upsert: true, session },
            );
          }
        }

        await writeHistory(
          session,
          {
            orderId:
              order._id,

            orderNumber:
              order.orderNumber,

            fromStatus:
              null,

            toStatus:
              "PENDING_PAYMENT",

            actor: {
              actorType:
                "SYSTEM",
            },

            note:
              "Order created and inventory reserved.",
          },
        );

        createdOrder =
          serializeOrder(
            order,
          );
      },
    );
  } finally {
    await session.endSession();
  }

  if (!createdOrder) {
    const recovered =
      await OrderModel.findOne({
        paymentId,
      });

    if (!recovered) {
      throw new Error(
        "Order transaction completed without an order record.",
      );
    }

    return serializeOrder(
      recovered,
    );
  }

  return createdOrder;
}

function paymentTargetStatus(
  paymentStatus: string,
  currentOrderStatus: string,
): string | null {
  if (
    currentOrderStatus ===
    "CANCELLED"
  ) {
    return null;
  }

  switch (paymentStatus) {
    case "AUTHORIZED":
      return [
        "PENDING_PAYMENT",
        "PAYMENT_FAILED",
      ].includes(
        currentOrderStatus,
      )
        ? "PAYMENT_AUTHORIZED"
        : null;

    case "SUCCEEDED":
      return [
        "PENDING_PAYMENT",
        "PAYMENT_AUTHORIZED",
        "PAYMENT_FAILED",
      ].includes(
        currentOrderStatus,
      )
        ? "CONFIRMED"
        : null;

    case "FAILED":
      return currentOrderStatus ===
        "PENDING_PAYMENT"
        ? "PAYMENT_FAILED"
        : null;

    case "CANCELLED":
      return "CANCELLED";

    case "PARTIALLY_REFUNDED":
      return null;

    case "REFUNDED":
      return "REFUNDED";

    default:
      return null;
  }
}

export async function syncOrderFromPayment(
  paymentId: string,
  actorType:
    | "SYSTEM"
    | "STRIPE"
    | "ADMIN" =
    "SYSTEM",
): Promise<OrderSummary | null> {
  const payment =
    await PaymentModel.findById(
      paymentId,
    );

  if (!payment?.orderId) {
    return null;
  }

  const session =
    await mongoose.startSession();

  let result:
    OrderSummary | null =
    null;

  let resultCartId:
    Types.ObjectId | null =
    null;

  try {
    await session.withTransaction(
      async () => {
        const order =
          await OrderModel.findById(
            payment.orderId,
          ).session(session);

        if (!order) {
          return;
        }

        const previous =
          order.orderStatus;

        const target =
          paymentTargetStatus(
            payment.status,
            previous,
          );

        order.paymentStatus =
          payment.status;

        const releaseForFailedIntentCreation =
          target ===
            "PAYMENT_FAILED" &&
          !payment.providerPaymentIntentId;

        if (
          target &&
          (
            [
              "CANCELLED",
              "REFUNDED",
            ].includes(target) ||
            releaseForFailedIntentCreation
          ) &&
          order.inventoryReservationStatus ===
            "ACTIVE"
        ) {
          await releaseReservationInSession(
            session,
            order,
            {
              actorType,
            },
            `Inventory released after payment status ${payment.status}.`,
          );
        }

        if (
          target &&
          (["CANCELLED", "REFUNDED"].includes(target) || releaseForFailedIntentCreation) &&
          order.customerValueSnapshot &&
          !order.customerValueSnapshot.redemptionsReversedAt
        ) {
          await reverseOrderValueRedemptionsInSession(session, {
            orderId: order._id,
            customerId: order.customerId ?? null,
            currency: order.pricing.currency,
            snapshot: order.customerValueSnapshot,
            reason: `Customer-value redemption restored after payment status ${payment.status}.`,
          });
          order.customerValueSnapshot.redemptionsReversedAt = new Date();
        }

        if (payment.status === "SUCCEEDED" && order.customerId) {
          const pointsEarned = await awardLoyaltyForOrderInSession(session, {
            orderId: order._id,
            customerId: order.customerId,
            eligibleMinor: Math.max(
              0,
              order.pricing.subtotalMinor -
                order.pricing.discountMinor -
                (order.customerValueSnapshot?.loyaltyMinor ?? 0),
            ),
          });
          if (pointsEarned > 0) {
            if (!order.customerValueSnapshot) {
              order.customerValueSnapshot = {
                loyaltyPointsRedeemed: 0,
                loyaltyMinor: 0,
                storeCreditMinor: 0,
                giftCardId: null,
                giftCardLastFour: "",
                giftCardMinor: 0,
                totalMinor: 0,
                loyaltyPointsEarned: pointsEarned,
                loyaltyPointsRestored: 0,
                storeCreditRestoredMinor: 0,
                giftCardRestoredMinor: 0,
                fulfillmentRestoredMinor: 0,
                fulfillmentReconciledAt: null,
                redemptionsReversedAt: null,
                loyaltyEarnReversedAt: null,
              };
            } else {
              order.customerValueSnapshot.loyaltyPointsEarned = pointsEarned;
            }
          }
        }

        if (target === "REFUNDED" && order.customerValueSnapshot && !order.customerValueSnapshot.loyaltyEarnReversedAt) {
          await reverseLoyaltyEarnForOrderInSession(session, {
            orderId: order._id,
            customerId: order.customerId ?? null,
            points: order.customerValueSnapshot.loyaltyPointsEarned ?? 0,
            reason: "Loyalty earnings reversed because the order was fully refunded.",
          });
          order.customerValueSnapshot.loyaltyEarnReversedAt = new Date();
        }

        if (
          target &&
          target !== previous
        ) {
          order.orderStatus =
            target as typeof order.orderStatus;

          await writeHistory(
            session,
            {
              orderId:
                order._id,

              orderNumber:
                order.orderNumber,

              fromStatus:
                previous,

              toStatus:
                target,

              actor: {
                actorType,
              },

              note:
                `Payment status changed to ${payment.status}.`,
            },
          );
        }

        await order.save({
          session,
        });

        result =
          serializeOrder(
            order,
          );

        resultCartId =
          order.cartId ??
          null;
      },
    );
  } finally {
    await session.endSession();
  }

  if (!result) {
    return null;
  }

  if (
    [
      "AUTHORIZED",
      "SUCCEEDED",
    ].includes(
      payment.status,
    ) &&
    resultCartId
  ) {
    await CartModel.updateOne(
      {
        _id:
          resultCartId,
      },
      {
        $set: {
          items:
            [],
          couponCode:
            "",
        },
      },
    );
  }

  return result;
}

export async function listCustomerOrders(
  customerId: string,
  query: CustomerOrderListQuery,
) {
  const filter = {
    customerId:
      new Types.ObjectId(
        customerId,
      ),
  };

  const skip =
    (query.page - 1) *
    query.limit;

  const [
    orders,
    total,
  ] = await Promise.all([
    OrderModel.find(filter)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(
        query.limit,
      ),

    OrderModel.countDocuments(
      filter,
    ),
  ]);

  return {
    items:
      orders.map(
        serializeOrder,
      ),

    pagination: {
      page:
        query.page,

      limit:
        query.limit,

      total,

      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function getCustomerOrder(
  customerId: string,
  orderNumberValue: string,
): Promise<OrderDetail> {
  const order =
    await OrderModel.findOne({
      customerId:
        new Types.ObjectId(
          customerId,
        ),

      orderNumber:
        orderNumberValue.toUpperCase(),
    });

  if (!order) {
    throw new ApiError(
      404,
      "ORDER_NOT_FOUND",
      "Order was not found.",
    );
  }

  return detailForOrder(
    order,
  );
}

export async function getOrderForOwner(
  owner: CartOwner,
  orderId: string,
): Promise<OrderDetail> {
  const order =
    await OrderModel.findOne({
      _id:
        new Types.ObjectId(
          orderId,
        ),

      ...ownerFilter(owner),
    });

  if (!order) {
    throw new ApiError(
      404,
      "ORDER_NOT_FOUND",
      "Order was not found.",
    );
  }

  return detailForOrder(
    order,
  );
}

export async function listAdminOrders(
  query: AdminOrderListQuery,
) {
  const filter:
    Record<string, unknown> =
    {};

  if (query.storeId) {
    filter.storeId =
      new Types.ObjectId(
        query.storeId,
      );
  }

  if (query.orderStatus) {
    filter.orderStatus =
      query.orderStatus;
  }

  if (query.paymentStatus) {
    filter.paymentStatus =
      query.paymentStatus;
  }

  if (query.fulfillmentType) {
    filter.fulfillmentType =
      query.fulfillmentType;
  }

  if (query.search) {
    const escaped =
      query.search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

    const regex =
      new RegExp(
        escaped,
        "i",
      );

    filter.$or = [
      {
        orderNumber:
          regex,
      },
      {
        "contactSnapshot.email":
          regex,
      },
      {
        "contactSnapshot.firstName":
          regex,
      },
      {
        "contactSnapshot.lastName":
          regex,
      },
    ];
  }

  if (
    query.dateFrom ||
    query.dateTo
  ) {
    const createdAt:
      Record<string, Date> =
      {};

    if (query.dateFrom) {
      createdAt.$gte =
        query.dateFrom;
    }

    if (query.dateTo) {
      createdAt.$lte =
        query.dateTo;
    }

    filter.createdAt =
      createdAt;
  }

  const skip =
    (query.page - 1) *
    query.limit;

  const [
    orders,
    total,
  ] = await Promise.all([
    OrderModel.find(filter)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(
        query.limit,
      ),

    OrderModel.countDocuments(
      filter,
    ),
  ]);

  return {
    items:
      orders.map(
        serializeOrder,
      ),

    pagination: {
      page:
        query.page,

      limit:
        query.limit,

      total,

      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function getAdminOrder(
  orderId: string,
): Promise<OrderDetail> {
  const order =
    await OrderModel.findById(
      orderId,
    );

  if (!order) {
    throw new ApiError(
      404,
      "ORDER_NOT_FOUND",
      "Order was not found.",
    );
  }

  return detailForOrder(
    order,
  );
}

export async function updateAdminOrderStatus(
  orderId: string,
  status:
    | "CONFIRMED"
    | "PROCESSING",
  actor: OrderActor,
  note: string,
): Promise<OrderDetail> {
  const session =
    await mongoose.startSession();

  try {
    await session.withTransaction(
      async () => {
        const order =
          await OrderModel.findById(
            orderId,
          ).session(session);

        if (!order) {
          throw new ApiError(
            404,
            "ORDER_NOT_FOUND",
            "Order was not found.",
          );
        }

        if (
          [
            "CANCELLED",
            "REFUNDED",
            "DELIVERED",
            "PICKED_UP",
          ].includes(
            order.orderStatus,
          )
        ) {
          throw new ApiError(
            409,
            "ORDER_STATUS_FINAL",
            "This order can no longer be moved to another processing status.",
          );
        }

        if (
          ![
            "AUTHORIZED",
            "SUCCEEDED",
            "PARTIALLY_REFUNDED",
          ].includes(
            order.paymentStatus,
          )
        ) {
          throw new ApiError(
            409,
            "ORDER_PAYMENT_NOT_READY",
            "Payment must be authorized or captured before processing the order.",
          );
        }

        const allowed =
          status ===
          "CONFIRMED"
            ? [
                "PAYMENT_AUTHORIZED",
                "PENDING_PAYMENT",
                "PAYMENT_FAILED",
              ]
            : [
                "CONFIRMED",
                "PAYMENT_AUTHORIZED",
              ];

        if (
          !allowed.includes(
            order.orderStatus,
          )
        ) {
          throw new ApiError(
            409,
            "ORDER_STATUS_TRANSITION_INVALID",
            "The requested order status transition is not allowed.",
          );
        }

        const previous =
          order.orderStatus;

        order.orderStatus =
          status;

        await order.save({
          session,
        });

        await writeHistory(
          session,
          {
            orderId:
              order._id,

            orderNumber:
              order.orderNumber,

            fromStatus:
              previous,

            toStatus:
              status,

            actor,

            note,
          },
        );
      },
    );
  } finally {
    await session.endSession();
  }

  return getAdminOrder(
    orderId,
  );
}

export async function cancelOrderRecord(
  orderId: string,
  actor: OrderActor,
  reason: string,
): Promise<OrderDetail> {
  const session =
    await mongoose.startSession();

  try {
    await session.withTransaction(
      async () => {
        const order =
          await OrderModel.findById(
            orderId,
          ).session(session);

        if (!order) {
          throw new ApiError(
            404,
            "ORDER_NOT_FOUND",
            "Order was not found.",
          );
        }

        if (
          order.orderStatus ===
          "CANCELLED"
        ) {
          if (!order.cancellation) {
            order.cancellation = {
              reason,

              cancelledAt:
                new Date(),

              actorType:
                actor.actorType ===
                "STRIPE"
                  ? "SYSTEM"
                  : actor.actorType,

              actorId:
                actorObjectId(
                  actor,
                ),
            };

            await order.save({
              session,
            });
          }

          return;
        }

        if (
          order.inventoryReservationStatus ===
          "COMMITTED"
        ) {
          throw new ApiError(
            409,
            "ORDER_ALREADY_FULFILLED",
            "Inventory has already been committed for this order. Use a return/refund workflow instead of cancellation.",
          );
        }

        if (
          [
            "DELIVERED",
            "PICKED_UP",
          ].includes(
            order.orderStatus,
          )
        ) {
          throw new ApiError(
            409,
            "ORDER_CANNOT_BE_CANCELLED",
            "This order can no longer be cancelled.",
          );
        }

        const previous =
          order.orderStatus;

        await releaseReservationInSession(
          session,
          order,
          actor,
          `Inventory released because order ${order.orderNumber} was cancelled.`,
        );

        if (order.customerValueSnapshot && !order.customerValueSnapshot.redemptionsReversedAt) {
          await reverseOrderValueRedemptionsInSession(session, {
            orderId: order._id,
            customerId: order.customerId ?? null,
            currency: order.pricing.currency,
            snapshot: order.customerValueSnapshot,
            reason: `Customer-value redemption restored because order ${order.orderNumber} was cancelled.`,
          });
          order.customerValueSnapshot.redemptionsReversedAt = new Date();
        }

        order.orderStatus =
          "CANCELLED";

        order.cancellation = {
          reason,

          cancelledAt:
            new Date(),

          actorType:
            actor.actorType ===
              "STRIPE"
              ? "SYSTEM"
              : actor.actorType,

          actorId:
            actorObjectId(
              actor,
            ),
        };

        await order.save({
          session,
        });

        await CouponRedemptionModel.deleteMany({ orderId: order._id }).session(session);

        await writeHistory(
          session,
          {
            orderId:
              order._id,

            orderNumber:
              order.orderNumber,

            fromStatus:
              previous,

            toStatus:
              "CANCELLED",

            actor,

            note:
              reason,
          },
        );
      },
    );
  } finally {
    await session.endSession();
  }

  return getAdminOrder(
    orderId,
  );
}

export async function reorderCustomerOrder(
  customerId: string,
  orderNumberValue: string,
) {
  const order =
    await OrderModel.findOne({
      customerId:
        new Types.ObjectId(
          customerId,
        ),

      orderNumber:
        orderNumberValue.toUpperCase(),
    });

  if (!order) {
    throw new ApiError(
      404,
      "ORDER_NOT_FOUND",
      "Order was not found.",
    );
  }

  return addCartItems(
    {
      customerId,
    },
    order.storeId.toString(),
    order.items.map(
      (item) => ({
        productId:
          item.productId.toString(),

        variantId:
          item.variantId.toString(),

        quantity:
          item.requestedQuantity,
      }),
    ),
  );
}