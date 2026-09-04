import mongoose, { type ClientSession, Types } from "mongoose";
import type { z } from "zod";

import { taxService } from "../checkout/tax.service.js";
import { InventoryBatchModel } from "../inventory/inventory-batch.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import {
  releaseInventoryInSession,
  reserveInventoryInSession,
  type InventoryActor,
} from "../inventory/inventory.service.js";
import { OrderStatusHistoryModel } from "../orders/order-status-history.model.js";
import { OrderModel, type Order } from "../orders/order.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { OrderSubstitutionModel } from "../substitutions/order-substitution.model.js";
import { ApiError } from "../../utils/api-error.js";
import type {
  markPickedSchema,
  markUnavailableSchema,
  pickingListQuerySchema,
  substituteItemSchema,
  substitutionCandidateQuerySchema,
} from "./picking.validation.js";

type PickingListQuery = z.infer<typeof pickingListQuerySchema>;
type MarkPickedInput = z.infer<typeof markPickedSchema>;
type MarkUnavailableInput = z.infer<typeof markUnavailableSchema>;
type SubstituteItemInput = z.infer<typeof substituteItemSchema>;
type SubstitutionCandidateQuery = z.infer<typeof substitutionCandidateQuerySchema>;
type OrderItem = Order["items"][number];

export interface FulfillmentActor {
  adminUserId: string;
  roleNames: string[];
}

interface SelectedBatchSnapshot {
  batchId: string;
  batchNumber: string;
  expiryDate: string | null;
}

function inventoryActor(actor: FulfillmentActor): InventoryActor {
  return {
    adminUserId: actor.adminUserId,
    roleNames: actor.roleNames,
  };
}

function currentPriceMinor(variant: {
  pricing: {
    regularPriceMinor: number;
    salePriceMinor?: number | null;
  };
}): number {
  const sale = variant.pricing.salePriceMinor ?? null;
  return sale !== null && sale < variant.pricing.regularPriceMinor
    ? sale
    : variant.pricing.regularPriceMinor;
}

function escapedRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function activeReservationQuantity(item: OrderItem): number {
  if (item.inventoryFulfillmentStatus === "RELEASED" || item.inventoryFulfillmentStatus === "COMMITTED") {
    return 0;
  }
  return item.reservedQuantity ?? item.requestedQuantity;
}

function originalDiscountForSubtotal(item: OrderItem, subtotalMinor: number): number {
  if (item.lineSubtotalMinor <= 0 || item.discountMinor <= 0 || subtotalMinor <= 0) {
    return 0;
  }
  const ratio = item.discountMinor / item.lineSubtotalMinor;
  return Math.min(subtotalMinor, Math.max(0, Math.round(subtotalMinor * ratio)));
}

function originalTaxRateBasisPoints(order: Order, item: OrderItem): number {
  return order.taxLinesSnapshot.find(
    (line) =>
      line.productId.toString() === item.productId.toString() &&
      line.variantId.toString() === item.variantId.toString(),
  )?.rateBasisPoints ?? 0;
}

function applyOriginalFulfillmentPricing(order: Order, item: OrderItem, quantity: number): void {
  const subtotalMinor = Math.max(0, Math.round(item.unitPriceMinor * quantity));
  const discountMinor = originalDiscountForSubtotal(item, subtotalMinor);
  const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = Math.round(taxableMinor * (originalTaxRateBasisPoints(order, item) / 10_000));

  item.fulfilledUnitPriceMinor = item.unitPriceMinor;
  item.fulfilledLineSubtotalMinor = subtotalMinor;
  item.fulfilledDiscountMinor = discountMinor;
  item.fulfilledTaxMinor = taxMinor;
  item.fulfilledLineMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor);
}

function zeroFulfillmentPricing(item: OrderItem): void {
  item.fulfilledUnitPriceMinor = 0;
  item.fulfilledLineSubtotalMinor = 0;
  item.fulfilledDiscountMinor = 0;
  item.fulfilledTaxMinor = 0;
  item.fulfilledLineMinor = 0;
}

function projectedLine(item: OrderItem) {
  if (item.fulfillmentStatus === "UNAVAILABLE") {
    return { subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 };
  }

  if (item.fulfillmentStatus === "PICKED" || item.fulfillmentStatus === "SUBSTITUTED") {
    return {
      subtotalMinor: item.fulfilledLineSubtotalMinor ?? item.lineSubtotalMinor,
      discountMinor: item.fulfilledDiscountMinor ?? item.discountMinor,
      taxMinor: item.fulfilledTaxMinor ?? item.taxMinor,
      totalMinor: item.fulfilledLineMinor ?? item.finalLineMinor,
    };
  }

  return {
    subtotalMinor: item.lineSubtotalMinor,
    discountMinor: item.discountMinor,
    taxMinor: item.taxMinor,
    totalMinor: item.finalLineMinor,
  };
}

function refreshFulfillmentPricing(order: Order): void {
  const lines = order.items.map(projectedLine);
  const productSubtotalMinor = lines.reduce((sum, line) => sum + line.subtotalMinor, 0);
  const productDiscountMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const productTaxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);

  const originalProductSubtotalMinor = order.items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
  const originalProductDiscountMinor = order.items.reduce((sum, item) => sum + item.discountMinor, 0);
  const originalProductTaxMinor = order.items.reduce((sum, item) => sum + item.taxMinor, 0);

  const customSubtotalMinor = order.source === "QUOTE"
    ? Math.max(0, order.pricing.subtotalMinor - originalProductSubtotalMinor)
    : 0;
  const customDiscountMinor = order.source === "QUOTE"
    ? Math.max(0, order.pricing.discountMinor - originalProductDiscountMinor)
    : 0;
  const customTaxMinor = order.source === "QUOTE"
    ? Math.max(0, order.pricing.taxMinor - originalProductTaxMinor)
    : 0;

  const subtotalMinor = productSubtotalMinor + customSubtotalMinor;
  const discountMinor = productDiscountMinor + customDiscountMinor;
  const taxMinor = productTaxMinor + customTaxMinor;
  const hasFulfillmentValue = subtotalMinor - discountMinor + taxMinor > 0;
  const deliveryFeeMinor = hasFulfillmentValue ? order.pricing.deliveryFeeMinor : 0;
  const prepaidAmountMinor = order.pricing.prepaidAmountMinor ?? 0;

  order.fulfillmentPricing = {
    currency: order.pricing.currency,
    subtotalMinor,
    discountMinor,
    taxMinor,
    deliveryFeeMinor,
    prepaidAmountMinor,
    totalMinor: Math.max(
      0,
      subtotalMinor - discountMinor + taxMinor + deliveryFeeMinor - prepaidAmountMinor,
    ),
  };
}

function paymentCeiling(payment: {
  amountMinor: number;
  authorizedAmountMinor: number;
  capturedAmountMinor: number;
  captureMethod: string;
}): number {
  if (payment.captureMethod === "MANUAL") {
    return payment.capturedAmountMinor > 0
      ? payment.capturedAmountMinor
      : payment.authorizedAmountMinor;
  }

  return payment.capturedAmountMinor > 0
    ? payment.capturedAmountMinor
    : payment.amountMinor;
}

function assertWithinPaymentCeiling(order: Order, payment: {
  amountMinor: number;
  authorizedAmountMinor: number;
  capturedAmountMinor: number;
  captureMethod: string;
}): void {
  const totalMinor = order.fulfillmentPricing?.totalMinor ?? order.pricing.totalMinor;
  if (totalMinor <= 0) return;
  const ceiling = paymentCeiling(payment);

  if (ceiling <= 0) {
    throw new ApiError(
      409,
      "FULFILLMENT_PAYMENT_NOT_READY",
      "Payment authorization or capture must be available before fulfillment pricing can change.",
    );
  }

  if (totalMinor > ceiling) {
    throw new ApiError(
      409,
      "FULFILLMENT_TOTAL_EXCEEDS_AUTHORIZATION",
      "The fulfillment total exceeds the amount authorized or captured by Stripe. Reduce the picked weight or choose a lower-priced substitution.",
    );
  }
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

async function batchSnapshot(
  session: ClientSession,
  input: {
    storeId: string;
    productId: string;
    variantId: string;
    batchId?: string | null;
    quantity: number;
  },
): Promise<SelectedBatchSnapshot | null> {
  if (!input.batchId) {
    return null;
  }

  const batch = await InventoryBatchModel.findOne({
    _id: new Types.ObjectId(input.batchId),
    storeId: new Types.ObjectId(input.storeId),
    productId: new Types.ObjectId(input.productId),
    variantId: new Types.ObjectId(input.variantId),
    remainingQuantity: { $gte: input.quantity },
  }).session(session);

  if (!batch) {
    throw new ApiError(
      409,
      "PICKING_BATCH_UNAVAILABLE",
      "The selected inventory batch no longer contains enough stock.",
    );
  }

  if (batch.expiryDate && batch.expiryDate.getTime() < Date.now()) {
    throw new ApiError(
      409,
      "PICKING_BATCH_EXPIRED",
      "Expired inventory cannot be selected for customer fulfillment.",
    );
  }

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate?.toISOString() ?? null,
  };
}

async function adjustOriginalReservation(
  session: ClientSession,
  order: Order & { _id: Types.ObjectId },
  item: OrderItem,
  desiredQuantity: number,
  actor: FulfillmentActor,
): Promise<void> {
  const current = activeReservationQuantity(item);
  const common = {
    storeId: order.storeId.toString(),
    productId: item.productId.toString(),
    variantId: item.variantId.toString(),
    referenceType: "ORDER",
    referenceId: order._id.toString(),
  };

  if (desiredQuantity > current) {
    await reserveInventoryInSession(
      session,
      {
        ...common,
        quantity: desiredQuantity - current,
        note: `Additional variable-weight stock reserved while picking order ${order.orderNumber}.`,
      },
      inventoryActor(actor),
    );
  } else if (desiredQuantity < current) {
    await releaseInventoryInSession(
      session,
      {
        ...common,
        quantity: current - desiredQuantity,
        note: `Unused reservation released while picking order ${order.orderNumber}.`,
      },
      inventoryActor(actor),
    );
  }

  item.reservedQuantity = desiredQuantity;
  item.inventoryFulfillmentStatus = desiredQuantity > 0 ? "RESERVED" : "RELEASED";
}

async function orderAndPaymentInSession(orderId: string, session: ClientSession) {
  const order = await OrderModel.findById(orderId).session(session);
  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }

  const payment = await PaymentModel.findById(order.paymentId).session(session);
  if (!payment) {
    throw new ApiError(409, "ORDER_PAYMENT_MISSING", "This order is not linked to a payment record.");
  }

  return { order, payment };
}

function itemById(order: Order, orderItemId: string): OrderItem {
  const item = order.items.find((entry) => entry._id.toString() === orderItemId);
  if (!item) {
    throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item was not found.");
  }
  return item;
}

function assertPickingOrder(order: Order): void {
  if (order.orderStatus !== "PICKING") {
    throw new ApiError(409, "ORDER_NOT_IN_PICKING", "Start picking before updating fulfillment items.");
  }
}

function serializeBatch(value: {
  batchId: Types.ObjectId;
  batchNumber: string;
  expiryDate?: Date | null;
} | null | undefined) {
  return value
    ? {
        batchId: value.batchId.toString(),
        batchNumber: value.batchNumber,
        expiryDate: value.expiryDate?.toISOString() ?? null,
      }
    : null;
}

export async function getFulfillmentOrderDetail(orderId: string) {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }

  const [payment, substitutions] = await Promise.all([
    PaymentModel.findById(order.paymentId).lean(),
    OrderSubstitutionModel.find({ orderId: order._id, status: "ACTIVE" }).sort({ createdAt: 1 }).lean(),
  ]);
  const substitutionsByItem = new Map(
    substitutions.map((entry) => [entry.orderItemId.toString(), entry]),
  );

  const effectivePricing = order.fulfillmentPricing ?? order.pricing;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    store: {
      id: order.storeSnapshot.storeId.toString(),
      name: order.storeSnapshot.name,
      code: order.storeSnapshot.code,
      timezone: order.storeSnapshot.timezone,
    },
    fulfillmentType: order.fulfillmentType,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    inventoryReservationStatus: order.inventoryReservationStatus,
    originalPricing: order.pricing,
    fulfillmentPricing: effectivePricing,
    customerNotes: order.customerNotes,
    picking: {
      startedAt: order.picking?.startedAt?.toISOString() ?? null,
      startedByAdminId: order.picking?.startedByAdminId?.toString() ?? null,
      completedAt: order.picking?.completedAt?.toISOString() ?? null,
      completedByAdminId: order.picking?.completedByAdminId?.toString() ?? null,
    },
    packing: {
      bagCount: order.packing?.bagCount ?? 0,
      notes: order.packing?.notes ?? "",
      completedAt: order.packing?.completedAt?.toISOString() ?? null,
      completedByAdminId: order.packing?.completedByAdminId?.toString() ?? null,
    },
    payment: payment
      ? {
          id: payment._id.toString(),
          captureMethod: payment.captureMethod,
          status: payment.status,
          currency: payment.currency,
          amountMinor: payment.amountMinor,
          authorizedAmountMinor: payment.authorizedAmountMinor,
          capturedAmountMinor: payment.capturedAmountMinor,
          refundedAmountMinor: payment.refundedAmountMinor,
        }
      : null,
    items: order.items.map((item) => {
      const substitution = substitutionsByItem.get(item._id.toString());
      return {
        id: item._id.toString(),
        productId: item.productId.toString(),
        variantId: item.variantId.toString(),
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        productType: item.productTypeSnapshot,
        sellingUnit: item.sellingUnitSnapshot,
        requestedQuantity: item.requestedQuantity,
        requestedWeight: item.requestedWeight ?? null,
        actualWeight: item.actualWeight ?? null,
        pickedQuantity: item.pickedQuantity ?? null,
        reservedQuantity: activeReservationQuantity(item),
        fulfillmentStatus: item.fulfillmentStatus ?? "PENDING",
        inventoryFulfillmentStatus: item.inventoryFulfillmentStatus ?? "RESERVED",
        substitutionPreference: item.substitutionPreference,
        selectedBatch: serializeBatch(item.selectedBatch),
        originalPricing: {
          unitPriceMinor: item.unitPriceMinor,
          lineSubtotalMinor: item.lineSubtotalMinor,
          discountMinor: item.discountMinor,
          taxMinor: item.taxMinor,
          finalLineMinor: item.finalLineMinor,
        },
        fulfilledPricing: {
          unitPriceMinor: item.fulfilledUnitPriceMinor ?? item.unitPriceMinor,
          lineSubtotalMinor: item.fulfilledLineSubtotalMinor ?? item.lineSubtotalMinor,
          discountMinor: item.fulfilledDiscountMinor ?? item.discountMinor,
          taxMinor: item.fulfilledTaxMinor ?? item.taxMinor,
          finalLineMinor: item.fulfilledLineMinor ?? item.finalLineMinor,
        },
        substitution: substitution
          ? {
              id: substitution._id.toString(),
              replacementProductId: substitution.replacementProductId.toString(),
              replacementVariantId: substitution.replacementVariantId.toString(),
              productName: substitution.replacementProductNameSnapshot,
              productSlug: substitution.replacementProductSlugSnapshot,
              sku: substitution.replacementSkuSnapshot,
              productType: substitution.replacementProductTypeSnapshot,
              sellingUnit: substitution.replacementSellingUnitSnapshot,
              quantity: substitution.replacementQuantity,
              unitPriceMinor: substitution.replacementUnitPriceMinor,
              lineSubtotalMinor: substitution.replacementLineSubtotalMinor,
              discountMinor: substitution.replacementDiscountMinor,
              taxMinor: substitution.replacementTaxMinor,
              finalLineMinor: substitution.replacementFinalLineMinor,
              selectedBatch: serializeBatch(substitution.selectedBatch),
              customerApproved: substitution.customerApproved,
              reason: substitution.reason,
            }
          : null,
      };
    }),
  };
}

export async function listPickingOrders(query: PickingListQuery) {
  const filter: Record<string, unknown> = {
    orderStatus: { $in: ["PAYMENT_AUTHORIZED", "CONFIRMED", "PROCESSING", "PICKING"] },
  };
  if (query.storeId) {
    filter.storeId = new Types.ObjectId(query.storeId);
  }
  if (query.search) {
    const regex = escapedRegex(query.search);
    filter.$or = [
      { orderNumber: regex },
      { "contactSnapshot.firstName": regex },
      { "contactSnapshot.lastName": regex },
      { "contactSnapshot.email": regex },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [orders, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(query.limit).lean(),
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
      pendingItemCount: order.items.filter((item) => (item.fulfillmentStatus ?? "PENDING") === "PENDING").length,
      createdAt: order.createdAt.toISOString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function startPicking(orderId: string, actor: FulfillmentActor) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { order, payment } = await orderAndPaymentInSession(orderId, session);

      if (order.orderStatus === "PICKING") {
        return;
      }
      if (!["PAYMENT_AUTHORIZED", "CONFIRMED", "PROCESSING"].includes(order.orderStatus)) {
        throw new ApiError(409, "ORDER_NOT_READY_FOR_PICKING", "This order is not ready to enter the picking workflow.");
      }
      if (!["AUTHORIZED", "SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
        throw new ApiError(409, "ORDER_PAYMENT_NOT_READY", "Payment must be authorized or captured before picking starts.");
      }
      if (order.inventoryReservationStatus !== "ACTIVE") {
        throw new ApiError(409, "ORDER_RESERVATION_NOT_ACTIVE", "The order inventory reservation is not active.");
      }

      const previous = order.orderStatus;
      for (const item of order.items) {
        if (item.reservedQuantity === null || item.reservedQuantity === undefined) {
          item.reservedQuantity = item.requestedQuantity;
        }
      }
      order.picking = {
        startedAt: order.picking?.startedAt ?? new Date(),
        startedByAdminId: order.picking?.startedByAdminId ?? new Types.ObjectId(actor.adminUserId),
        completedAt: null,
        completedByAdminId: null,
      };
      order.orderStatus = "PICKING";
      refreshFulfillmentPricing(order);
      await order.save({ session });
      await writeHistory(session, order, previous, "PICKING", actor, "Picking started.");
    });
  } finally {
    await session.endSession();
  }

  return getFulfillmentOrderDetail(orderId);
}

export async function markOrderItemPicked(
  orderId: string,
  orderItemId: string,
  input: MarkPickedInput,
  actor: FulfillmentActor,
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { order, payment } = await orderAndPaymentInSession(orderId, session);
      assertPickingOrder(order);
      const item = itemById(order, orderItemId);

      if (!["PENDING", "PICKED"].includes(item.fulfillmentStatus ?? "PENDING")) {
        throw new ApiError(409, "ORDER_ITEM_ALREADY_RESOLVED", "This item has already been resolved by another fulfillment action.");
      }

      const isVariable = item.productTypeSnapshot === "VARIABLE_WEIGHT";
      const pickedQuantity = isVariable
        ? input.actualWeight
        : input.pickedQuantity ?? item.requestedQuantity;

      if (!pickedQuantity || pickedQuantity <= 0) {
        throw new ApiError(
          400,
          isVariable ? "ACTUAL_WEIGHT_REQUIRED" : "PICKED_QUANTITY_REQUIRED",
          isVariable ? "Actual weight is required for variable-weight products." : "Picked quantity must be greater than zero.",
        );
      }
      if (!isVariable && pickedQuantity > item.requestedQuantity) {
        throw new ApiError(400, "PICKED_QUANTITY_TOO_HIGH", "Picked quantity cannot exceed the requested quantity for this product.");
      }

      await adjustOriginalReservation(session, order, item, pickedQuantity, actor);
      const batch = await batchSnapshot(session, {
        storeId: order.storeId.toString(),
        productId: item.productId.toString(),
        variantId: item.variantId.toString(),
        batchId: input.batchId,
        quantity: pickedQuantity,
      });

      item.fulfillmentStatus = "PICKED";
      item.pickedQuantity = pickedQuantity;
      item.actualWeight = isVariable ? pickedQuantity : null;
      item.selectedBatch = batch
        ? {
            batchId: new Types.ObjectId(batch.batchId),
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
          }
        : null;
      applyOriginalFulfillmentPricing(order, item, pickedQuantity);
      refreshFulfillmentPricing(order);
      assertWithinPaymentCeiling(order, payment);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return getFulfillmentOrderDetail(orderId);
}

export async function markOrderItemUnavailable(
  orderId: string,
  orderItemId: string,
  input: MarkUnavailableInput,
  actor: FulfillmentActor,
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { order, payment } = await orderAndPaymentInSession(orderId, session);
      assertPickingOrder(order);
      const item = itemById(order, orderItemId);

      if (item.fulfillmentStatus === "SUBSTITUTED") {
        throw new ApiError(409, "ORDER_ITEM_ALREADY_SUBSTITUTED", "A substituted item cannot be marked unavailable without cancelling its substitution first.");
      }
      if (item.fulfillmentStatus === "UNAVAILABLE") {
        return;
      }

      const current = activeReservationQuantity(item);
      if (current > 0) {
        await releaseInventoryInSession(
          session,
          {
            storeId: order.storeId.toString(),
            productId: item.productId.toString(),
            variantId: item.variantId.toString(),
            quantity: current,
            referenceType: "ORDER",
            referenceId: order._id.toString(),
            note: `Released unavailable item while picking order ${order.orderNumber}: ${input.reason}`,
          },
          inventoryActor(actor),
        );
      }

      item.reservedQuantity = 0;
      item.inventoryFulfillmentStatus = "RELEASED";
      item.fulfillmentStatus = "UNAVAILABLE";
      item.pickedQuantity = 0;
      item.actualWeight = null;
      item.selectedBatch = null;
      zeroFulfillmentPricing(item);
      refreshFulfillmentPricing(order);
      assertWithinPaymentCeiling(order, payment);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return getFulfillmentOrderDetail(orderId);
}

async function taxAddressForOrder(order: Order) {
  if (order.deliveryAddress) {
    return {
      country: order.deliveryAddress.country,
      state: order.deliveryAddress.state,
      city: order.deliveryAddress.city,
      postalCode: order.deliveryAddress.postalCode,
    };
  }

  const store = await StoreLocationModel.findById(order.storeId).lean();
  if (!store) {
    throw new ApiError(404, "STORE_NOT_FOUND", "Order store was not found.");
  }
  return {
    country: store.address.country,
    state: store.address.state,
    city: store.address.city,
    postalCode: store.address.postalCode,
  };
}

export async function substituteOrderItem(
  orderId: string,
  orderItemId: string,
  input: SubstituteItemInput,
  actor: FulfillmentActor,
) {
  const previewOrder = await OrderModel.findById(orderId).lean();
  if (!previewOrder) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }
  const previewItem = previewOrder.items.find((entry) => entry._id.toString() === orderItemId);
  if (!previewItem) {
    throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item was not found.");
  }
  if (previewItem.substitutionPreference === "DO_NOT_SUBSTITUTE") {
    throw new ApiError(409, "SUBSTITUTION_NOT_ALLOWED", "The customer requested no substitutions for this item.");
  }
  if (previewItem.substitutionPreference === "CONTACT_FIRST" && !input.customerApproved) {
    throw new ApiError(409, "SUBSTITUTION_CUSTOMER_APPROVAL_REQUIRED", "Customer approval must be recorded before substituting this item.");
  }

  const replacementProduct = await ProductModel.findOne({
    _id: input.replacementProductId,
    isActive: true,
    archivedAt: null,
    "variants._id": input.replacementVariantId,
    "variants.status": "ACTIVE",
  }).lean();
  const replacementVariant = replacementProduct?.variants.find(
    (variant) => variant._id.toString() === input.replacementVariantId,
  );
  if (!replacementProduct || !replacementVariant || replacementVariant.status !== "ACTIVE") {
    throw new ApiError(404, "SUBSTITUTION_PRODUCT_NOT_AVAILABLE", "The replacement product option is not available.");
  }
  if (
    input.replacementProductId === previewItem.productId.toString() &&
    input.replacementVariantId === previewItem.variantId.toString()
  ) {
    throw new ApiError(400, "SUBSTITUTION_MUST_DIFFER", "Choose a different product or variant as the substitution.");
  }

  const storeProduct = await StoreProductModel.findOne({
    storeId: previewOrder.storeId,
    productId: replacementProduct._id,
  }).lean();
  if (storeProduct && !storeProduct.isAvailable) {
    throw new ApiError(409, "SUBSTITUTION_STORE_UNAVAILABLE", "The replacement product is disabled at this store.");
  }
  if (
    storeProduct &&
    previewOrder.fulfillmentType === "DELIVERY" &&
    !storeProduct.deliveryEnabled
  ) {
    throw new ApiError(409, "SUBSTITUTION_DELIVERY_UNAVAILABLE", "The replacement product is not enabled for delivery.");
  }
  if (
    storeProduct &&
    previewOrder.fulfillmentType === "PICKUP" &&
    !storeProduct.pickupEnabled
  ) {
    throw new ApiError(409, "SUBSTITUTION_PICKUP_UNAVAILABLE", "The replacement product is not enabled for pickup.");
  }

  const replacementUnitPriceMinor = currentPriceMinor(replacementVariant);
  const replacementLineSubtotalMinor = Math.round(replacementUnitPriceMinor * input.replacementQuantity);
  if (
    previewItem.substitutionPreference === "SAME_OR_LOWER" &&
    replacementLineSubtotalMinor > previewItem.lineSubtotalMinor
  ) {
    throw new ApiError(409, "SUBSTITUTION_PRICE_TOO_HIGH", "The customer requested a same-or-lower-priced substitution.");
  }

  const replacementDiscountMinor = originalDiscountForSubtotal(previewItem, replacementLineSubtotalMinor);
  const taxAddress = await taxAddressForOrder(previewOrder);
  const tax = await taxService.quote({
    currency: previewOrder.pricing.currency,
    address: taxAddress,
    lines: [{
      productId: replacementProduct._id.toString(),
      variantId: replacementVariant._id.toString(),
      taxClassification: replacementProduct.taxClassification,
      taxableAmountMinor: Math.max(0, replacementLineSubtotalMinor - replacementDiscountMinor),
      quantity: input.replacementQuantity,
    }],
  });
  const taxLine = tax.lines[0];
  const replacementTaxMinor = taxLine?.taxMinor ?? 0;
  const replacementFinalLineMinor = Math.max(
    0,
    replacementLineSubtotalMinor - replacementDiscountMinor + replacementTaxMinor,
  );
  const primaryImage = replacementProduct.images
    .slice()
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder)[0];

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { order, payment } = await orderAndPaymentInSession(orderId, session);
      assertPickingOrder(order);
      const item = itemById(order, orderItemId);

      if (!["PENDING", "PICKED"].includes(item.fulfillmentStatus ?? "PENDING")) {
        throw new ApiError(409, "ORDER_ITEM_ALREADY_RESOLVED", "This item has already been resolved by another fulfillment action.");
      }

      const originalReserved = activeReservationQuantity(item);
      if (originalReserved > 0) {
        await releaseInventoryInSession(
          session,
          {
            storeId: order.storeId.toString(),
            productId: item.productId.toString(),
            variantId: item.variantId.toString(),
            quantity: originalReserved,
            referenceType: "ORDER",
            referenceId: order._id.toString(),
            note: `Original item released for substitution on order ${order.orderNumber}.`,
          },
          inventoryActor(actor),
        );
      }

      await reserveInventoryInSession(
        session,
        {
          storeId: order.storeId.toString(),
          productId: replacementProduct._id.toString(),
          variantId: replacementVariant._id.toString(),
          quantity: input.replacementQuantity,
          referenceType: "ORDER",
          referenceId: order._id.toString(),
          note: `Replacement item reserved for order ${order.orderNumber}.`,
        },
        inventoryActor(actor),
      );

      const batch = await batchSnapshot(session, {
        storeId: order.storeId.toString(),
        productId: replacementProduct._id.toString(),
        variantId: replacementVariant._id.toString(),
        batchId: input.batchId,
        quantity: input.replacementQuantity,
      });

      const substitution = new OrderSubstitutionModel({
        orderId: order._id,
        orderItemId: item._id,
        originalProductId: item.productId,
        originalVariantId: item.variantId,
        originalProductNameSnapshot: item.productNameSnapshot,
        originalSkuSnapshot: item.skuSnapshot,
        originalRequestedQuantity: item.requestedQuantity,
        originalLineSubtotalMinor: item.lineSubtotalMinor,
        replacementProductId: replacementProduct._id,
        replacementVariantId: replacementVariant._id,
        replacementProductNameSnapshot: replacementProduct.name,
        replacementProductSlugSnapshot: replacementProduct.slug,
        replacementSkuSnapshot: replacementVariant.sku,
        replacementProductTypeSnapshot: replacementProduct.productType,
        replacementSellingUnitSnapshot: replacementVariant.sellingUnit,
        replacementUnitQuantitySnapshot: replacementVariant.unitQuantity,
        replacementImageSnapshot: primaryImage
          ? { url: primaryImage.url, altText: primaryImage.altText }
          : null,
        replacementQuantity: input.replacementQuantity,
        replacementUnitPriceMinor,
        replacementLineSubtotalMinor,
        replacementDiscountMinor,
        replacementTaxMinor,
        replacementFinalLineMinor,
        taxRateBasisPoints: taxLine?.rateBasisPoints ?? 0,
        taxRuleId: taxLine?.ruleId ? new Types.ObjectId(taxLine.ruleId) : null,
        selectedBatch: batch
          ? {
              batchId: new Types.ObjectId(batch.batchId),
              batchNumber: batch.batchNumber,
              expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
            }
          : null,
        reservedQuantity: input.replacementQuantity,
        customerApproved: input.customerApproved,
        reason: input.reason,
        status: "ACTIVE",
        createdByAdminId: new Types.ObjectId(actor.adminUserId),
        createdByRoleNames: actor.roleNames,
      });
      await substitution.save({ session });

      item.reservedQuantity = 0;
      item.inventoryFulfillmentStatus = "RELEASED";
      item.fulfillmentStatus = "SUBSTITUTED";
      item.pickedQuantity = 0;
      item.actualWeight = null;
      item.selectedBatch = null;
      item.substitutionId = substitution._id;
      item.fulfilledUnitPriceMinor = replacementUnitPriceMinor;
      item.fulfilledLineSubtotalMinor = replacementLineSubtotalMinor;
      item.fulfilledDiscountMinor = replacementDiscountMinor;
      item.fulfilledTaxMinor = replacementTaxMinor;
      item.fulfilledLineMinor = replacementFinalLineMinor;
      refreshFulfillmentPricing(order);
      assertWithinPaymentCeiling(order, payment);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return getFulfillmentOrderDetail(orderId);
}

export async function completePicking(orderId: string, actor: FulfillmentActor, note: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { order, payment } = await orderAndPaymentInSession(orderId, session);
      if (order.orderStatus === "PACKING") {
        return;
      }
      assertPickingOrder(order);

      if (order.items.some((item) => (item.fulfillmentStatus ?? "PENDING") === "PENDING")) {
        throw new ApiError(409, "PICKING_ITEMS_INCOMPLETE", "Every order item must be picked, substituted, or marked unavailable before picking can be completed.");
      }

      refreshFulfillmentPricing(order);
      const totalMinor = order.fulfillmentPricing?.totalMinor ?? 0;
      if (totalMinor <= 0) {
        throw new ApiError(409, "ORDER_HAS_NO_FULFILLED_ITEMS", "An order with no fulfilled items must be cancelled instead of packed.");
      }
      assertWithinPaymentCeiling(order, payment);

      const previous = order.orderStatus;
      order.picking = {
        startedAt: order.picking?.startedAt ?? new Date(),
        startedByAdminId: order.picking?.startedByAdminId ?? new Types.ObjectId(actor.adminUserId),
        completedAt: new Date(),
        completedByAdminId: new Types.ObjectId(actor.adminUserId),
      };
      order.orderStatus = "PACKING";
      await order.save({ session });
      await writeHistory(
        session,
        order,
        previous,
        "PACKING",
        actor,
        note || "Picking completed and order moved to packing.",
      );
    });
  } finally {
    await session.endSession();
  }

  return getFulfillmentOrderDetail(orderId);
}

export async function listSubstitutionCandidates(
  orderId: string,
  orderItemId: string,
  query: SubstitutionCandidateQuery,
) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }
  const item = order.items.find((entry) => entry._id.toString() === orderItemId);
  if (!item) {
    throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item was not found.");
  }

  const inventories = await InventoryModel.find({
    storeId: order.storeId,
    quantityAvailable: { $gt: 0 },
  }).sort({ quantityAvailable: -1 }).limit(250).lean();
  const productIds = [...new Set(inventories.map((entry) => entry.productId.toString()))];
  const [products, storeProducts] = await Promise.all([
    ProductModel.find({
      _id: { $in: productIds },
      isActive: true,
      archivedAt: null,
    }).lean(),
    StoreProductModel.find({ storeId: order.storeId, productId: { $in: productIds } }).lean(),
  ]);
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const storeProductMap = new Map(storeProducts.map((entry) => [entry.productId.toString(), entry]));
  const search = query.search ? escapedRegex(query.search) : null;

  const candidates = inventories.flatMap((inventory) => {
    const product = productMap.get(inventory.productId.toString());
    if (!product) return [];
    const storeProduct = storeProductMap.get(product._id.toString());
    if (storeProduct && !storeProduct.isAvailable) return [];
    if (storeProduct && order.fulfillmentType === "DELIVERY" && !storeProduct.deliveryEnabled) return [];
    if (storeProduct && order.fulfillmentType === "PICKUP" && !storeProduct.pickupEnabled) return [];
    const variant = product.variants.find((entry) => entry._id.toString() === inventory.variantId.toString());
    if (!variant || variant.status !== "ACTIVE") return [];
    if (product._id.toString() === item.productId.toString() && variant._id.toString() === item.variantId.toString()) return [];
    if (search && !search.test(product.name) && !search.test(variant.sku)) return [];
    const priceMinor = currentPriceMinor(variant);
    return [{
      productId: product._id.toString(),
      variantId: variant._id.toString(),
      productName: product.name,
      sku: variant.sku,
      productType: product.productType,
      sellingUnit: variant.sellingUnit,
      unitQuantity: variant.unitQuantity,
      priceMinor,
      currency: variant.pricing.currency,
      quantityAvailable: inventory.quantityAvailable,
      sameOrLower: priceMinor <= item.unitPriceMinor,
    }];
  });

  candidates.sort((left, right) => Number(right.sameOrLower) - Number(left.sameOrLower) || left.productName.localeCompare(right.productName));
  return candidates.slice(0, query.limit);
}

export async function listFefoBatches(orderId: string, orderItemId: string) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }
  const item = order.items.find((entry) => entry._id.toString() === orderItemId);
  if (!item) {
    throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item was not found.");
  }

  let productId = item.productId;
  let variantId = item.variantId;
  if ((item.fulfillmentStatus ?? "PENDING") === "SUBSTITUTED") {
    const substitution = await OrderSubstitutionModel.findOne({
      orderId: order._id,
      orderItemId: item._id,
      status: "ACTIVE",
    }).lean();
    if (!substitution) {
      throw new ApiError(409, "SUBSTITUTION_RECORD_MISSING", "The active substitution record could not be found.");
    }
    productId = substitution.replacementProductId;
    variantId = substitution.replacementVariantId;
  }

  const now = new Date();
  const batches = await InventoryBatchModel.find({
    storeId: order.storeId,
    productId,
    variantId,
    remainingQuantity: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }],
  }).sort({ expiryDate: 1, receivedDate: 1 }).limit(10).lean();

  return batches.map((batch, index) => ({
    id: batch._id.toString(),
    batchNumber: batch.batchNumber,
    remainingQuantity: batch.remainingQuantity,
    expiryDate: batch.expiryDate?.toISOString() ?? null,
    receivedDate: batch.receivedDate.toISOString(),
    recommended: index === 0,
  }));
}
