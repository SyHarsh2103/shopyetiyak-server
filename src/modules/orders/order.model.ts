import { model, Schema, type InferSchemaType } from "mongoose";

import { PAYMENT_STATUSES } from "../payments/payment.model.js";

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_AUTHORIZED",
  "CONFIRMED",
  "PROCESSING",
  "PICKING",
  "PACKING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "PAYMENT_FAILED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export const ORDER_RESERVATION_STATUSES = [
  "ACTIVE",
  "RELEASED",
  "COMMITTED",
] as const;

export const ORDER_ITEM_FULFILLMENT_STATUSES = [
  "PENDING",
  "PICKED",
  "SUBSTITUTED",
  "UNAVAILABLE",
] as const;

export const ORDER_ITEM_INVENTORY_STATUSES = [
  "RESERVED",
  "RELEASED",
  "COMMITTED",
] as const;

export const FULFILLMENT_SLOT_RESERVATION_STATUSES = [
  "ACTIVE",
  "RELEASED",
  "FULFILLED",
] as const;

const contactSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    recipientName: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, default: "", trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, required: true, trim: true, maxlength: 120 },
    postalCode: { type: String, required: true, trim: true, maxlength: 30 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    deliveryInstructions: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { _id: false },
);

const storeSnapshotSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    code: { type: String, required: true, trim: true, maxlength: 40 },
    timezone: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const attributeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const imageSnapshotSchema = new Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    altText: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: false },
);

const selectedBatchSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch", required: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
    expiryDate: { type: Date, default: null },
  },
  { _id: false },
);

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    productNameSnapshot: { type: String, required: true, trim: true, maxlength: 240 },
    productSlugSnapshot: { type: String, required: true, trim: true, maxlength: 260 },
    skuSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    productTypeSnapshot: {
      type: String,
      required: true,
      enum: ["FIXED_QUANTITY", "PACKAGED", "WEIGHT_BASED", "VARIABLE_WEIGHT"],
    },
    sellingUnitSnapshot: { type: String, required: true, trim: true, maxlength: 40 },
    unitQuantitySnapshot: { type: Number, required: true, min: 0 },
    attributesSnapshot: { type: [attributeSchema], default: [] },
    imageSnapshot: { type: imageSnapshotSchema, default: null },
    requestedQuantity: { type: Number, required: true, min: 0.001 },
    requestedWeight: { type: Number, default: null, min: 0 },
    actualWeight: { type: Number, default: null, min: 0 },
    pickedQuantity: { type: Number, default: null, min: 0 },
    reservedQuantity: { type: Number, default: null, min: 0 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    costPriceMinorSnapshot: { type: Number, default: null, min: 0 },
    lineSubtotalMinor: { type: Number, required: true, min: 0 },
    discountMinor: { type: Number, required: true, min: 0, default: 0 },
    taxMinor: { type: Number, required: true, min: 0, default: 0 },
    finalLineMinor: { type: Number, required: true, min: 0 },
    fulfilledUnitPriceMinor: { type: Number, default: null, min: 0 },
    fulfilledLineSubtotalMinor: { type: Number, default: null, min: 0 },
    fulfilledDiscountMinor: { type: Number, default: null, min: 0 },
    fulfilledTaxMinor: { type: Number, default: null, min: 0 },
    fulfilledLineMinor: { type: Number, default: null, min: 0 },
    fulfillmentStatus: {
      type: String,
      required: true,
      enum: ORDER_ITEM_FULFILLMENT_STATUSES,
      default: "PENDING",
    },
    inventoryFulfillmentStatus: {
      type: String,
      required: true,
      enum: ORDER_ITEM_INVENTORY_STATUSES,
      default: "RESERVED",
    },
    selectedBatch: { type: selectedBatchSchema, default: null },
    substitutionId: { type: Schema.Types.ObjectId, ref: "OrderSubstitution", default: null },
    substitutionPreference: {
      type: String,
      required: true,
      enum: ["NOT_SELECTED", "BEST_AVAILABLE", "SAME_OR_LOWER", "CONTACT_FIRST", "DO_NOT_SUBSTITUTE"],
      default: "NOT_SELECTED",
    },
  },
  { _id: true },
);

const pricingSchema = new Schema(
  {
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
    subtotalMinor: { type: Number, required: true, min: 0 },
    discountMinor: { type: Number, required: true, min: 0 },
    taxMinor: { type: Number, required: true, min: 0 },
    deliveryFeeMinor: { type: Number, required: true, min: 0 },
    prepaidAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const couponSnapshotSchema = new Schema(
  {
    code: { type: String, default: "", trim: true, uppercase: true, maxlength: 80 },
    discountMinor: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const taxLineSnapshotSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    taxableAmountMinor: { type: Number, required: true, min: 0 },
    taxMinor: { type: Number, required: true, min: 0 },
    rateBasisPoints: { type: Number, required: true, min: 0 },
    ruleId: { type: Schema.Types.ObjectId, ref: "TaxRule", default: null },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    cancelledAt: { type: Date, default: null },
    actorType: { type: String, enum: ["ADMIN", "CUSTOMER", "SYSTEM"], default: null },
    actorId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);


const deliveryZoneSnapshotSchema = new Schema(
  {
    zoneId: { type: Schema.Types.ObjectId, ref: "DeliveryZone", required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    minimumOrderMinor: { type: Number, required: true, min: 0 },
    deliveryFeeMinor: { type: Number, required: true, min: 0 },
    freeDeliveryThresholdMinor: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const fulfillmentSlotSnapshotSchema = new Schema(
  {
    slotId: { type: Schema.Types.ObjectId, required: true },
    date: { type: String, required: true, trim: true, maxlength: 10 },
    startTime: { type: String, required: true, trim: true, maxlength: 5 },
    endTime: { type: String, required: true, trim: true, maxlength: 5 },
    timezone: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const pickingSchema = new Schema(
  {
    startedAt: { type: Date, default: null },
    startedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    completedAt: { type: Date, default: null },
    completedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { _id: false },
);

const packingSchema = new Schema(
  {
    bagCount: { type: Number, default: 0, min: 0, max: 500 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    completedAt: { type: Date, default: null },
    completedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { _id: false },
);


const customerValueSnapshotSchema = new Schema(
  {
    loyaltyPointsRedeemed: { type: Number, required: true, min: 0, default: 0 },
    loyaltyMinor: { type: Number, required: true, min: 0, default: 0 },
    storeCreditMinor: { type: Number, required: true, min: 0, default: 0 },
    giftCardId: { type: Schema.Types.ObjectId, ref: "GiftCard", default: null },
    giftCardLastFour: { type: String, trim: true, maxlength: 4, default: "" },
    giftCardMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0, default: 0 },
    loyaltyPointsEarned: { type: Number, required: true, min: 0, default: 0 },
    loyaltyPointsRestored: { type: Number, required: true, min: 0, default: 0 },
    storeCreditRestoredMinor: { type: Number, required: true, min: 0, default: 0 },
    giftCardRestoredMinor: { type: Number, required: true, min: 0, default: 0 },
    fulfillmentRestoredMinor: { type: Number, required: true, min: 0, default: 0 },
    fulfillmentReconciledAt: { type: Date, default: null },
    redemptionsReversedAt: { type: Date, default: null },
    loyaltyEarnReversedAt: { type: Date, default: null },
  },
  { _id: false },
);

const quoteSnapshotSchema = new Schema(
  {
    quoteId: { type: Schema.Types.ObjectId, ref: "Quote", required: true },
    quoteNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
    requestId: { type: Schema.Types.ObjectId, ref: "BulkOrderRequest", required: true },
    originalTotalMinor: { type: Number, required: true, min: 0 },
    depositPaidMinor: { type: Number, required: true, min: 0, default: 0 },
    customLines: {
      type: [
        new Schema(
          {
            description: { type: String, required: true, trim: true, maxlength: 500 },
            quantity: { type: Number, required: true, min: 0.001 },
            unitPriceMinor: { type: Number, required: true, min: 0 },
            lineSubtotalMinor: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, trim: true, uppercase: true, unique: true },
    source: { type: String, required: true, enum: ["CHECKOUT", "QUOTE"], default: "CHECKOUT", index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    guestTokenHash: { type: String, default: null, select: false },
    guestCustomer: { type: contactSchema, default: null },
    contactSnapshot: { type: contactSchema, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    storeSnapshot: { type: storeSnapshotSchema, required: true },
    cartId: { type: Schema.Types.ObjectId, ref: "Cart", default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, unique: true },
    fulfillmentType: { type: String, required: true, enum: ["DELIVERY", "PICKUP"], index: true },
    deliveryAddress: { type: addressSchema, default: null },
    deliveryZone: { type: deliveryZoneSnapshotSchema, default: null },
    deliverySlot: { type: fulfillmentSlotSnapshotSchema, default: null },
    pickupSlot: { type: fulfillmentSlotSnapshotSchema, default: null },
    fulfillmentSlotReservationStatus: {
      type: String,
      enum: FULFILLMENT_SLOT_RESERVATION_STATUSES,
      required: true,
      default: "ACTIVE",
    },
    items: { type: [orderItemSchema], required: true, validate: [(items: unknown[]) => items.length > 0, "Order requires at least one item."] },
    pricing: { type: pricingSchema, required: true },
    fulfillmentPricing: { type: pricingSchema, default: null },
    couponSnapshot: { type: couponSnapshotSchema, required: true },
    taxLinesSnapshot: { type: [taxLineSnapshotSchema], default: [] },
    paymentStatus: { type: String, required: true, enum: PAYMENT_STATUSES, default: "PENDING", index: true },
    orderStatus: { type: String, required: true, enum: ORDER_STATUSES, default: "PENDING_PAYMENT", index: true },
    inventoryReservationStatus: { type: String, required: true, enum: ORDER_RESERVATION_STATUSES, default: "ACTIVE" },
    picking: { type: pickingSchema, default: () => ({}) },
    packing: { type: packingSchema, default: () => ({}) },
    customerNotes: { type: String, default: "", trim: true, maxlength: 1000 },
    cancellation: { type: cancellationSchema, default: null },
    customerValueSnapshot: { type: customerValueSnapshotSchema, default: null },
    quoteSnapshot: { type: quoteSnapshotSchema, default: null },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ guestTokenHash: 1, createdAt: -1 });
orderSchema.index({ storeId: 1, orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ "items.fulfillmentStatus": 1, orderStatus: 1 });
orderSchema.index({ "deliverySlot.slotId": 1, fulfillmentSlotReservationStatus: 1 });
orderSchema.index({ "pickupSlot.slotId": 1, fulfillmentSlotReservationStatus: 1 });
orderSchema.index({ "quoteSnapshot.quoteId": 1 }, { sparse: true });
orderSchema.index({ source: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = model("Order", orderSchema, "orders");
