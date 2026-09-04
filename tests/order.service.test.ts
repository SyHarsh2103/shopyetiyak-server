import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addCartItem, getCartQuote } from "../src/modules/carts/cart.service.js";
import { buildCheckoutReview } from "../src/modules/checkout/checkout.service.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { InventoryTransactionModel } from "../src/modules/inventory/inventory-transaction.model.js";
import { OrderStatusHistoryModel } from "../src/modules/orders/order-status-history.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import {
  cancelOrderRecord,
  ensureOrderForPayment,
  syncOrderFromPayment,
} from "../src/modules/orders/order.service.js";
import { PaymentModel } from "../src/modules/payments/payment.model.js";
import { PickupSlotModel } from "../src/modules/pickup/pickup-slot.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";
import { TaxRuleModel } from "../src/modules/taxes/tax-rule.model.js";

let replicaSet: MongoMemoryReplSet;
let storeId = "";
let productId = "";
let variantId = "";
let pickupSlotId = "";
const owner = { guestToken: "phase-nine-order-guest" };

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());

  const store = await StoreLocationModel.create({
    name: "Phase 9 Store",
    code: "P9",
    address: { line1: "9 Order Way", line2: "", city: "Jersey City", state: "NJ", postalCode: "07302", country: "USA" },
    timezone: "America/New_York",
    pickupEnabled: true,
    deliveryEnabled: true,
    status: "ACTIVE",
  });
  storeId = store.id;
  const pickupSlot = await PickupSlotModel.create({
    storeId: store._id,
    date: "2099-01-02",
    startTime: "10:00",
    endTime: "12:00",
    timezone: store.timezone,
    capacity: 10,
    bookedCount: 0,
    cutoffMinutes: 60,
    cutoffAt: new Date("2099-01-02T14:00:00.000Z"),
    status: "ACTIVE",
  });
  pickupSlotId = pickupSlot.id;

  const product = await ProductModel.create({
    name: "Phase 9 Rice",
    slug: "phase9-rice",
    shortDescription: "Order snapshot rice",
    description: "Order snapshot integration test product.",
    categoryIds: [],
    collectionIds: [],
    productType: "PACKAGED",
    taxClassification: "GROCERY",
    variants: [{
      sku: "P9-RICE-1",
      attributes: [{ name: "Size", value: "1 KG" }],
      pricing: { currency: "USD", costPriceMinor: 300, regularPriceMinor: 800, salePriceMinor: null },
      sellingUnit: "BAG",
      unitQuantity: 1,
      minimumQuantity: 1,
      maximumQuantity: 10,
      quantityIncrement: 1,
      status: "ACTIVE",
    }],
    isActive: true,
    archivedAt: null,
  });
  productId = product.id;
  const variant = product.variants[0];
  if (!variant) throw new Error("Variant missing.");
  variantId = variant._id.toString();

  await InventoryModel.create({
    storeId: store._id,
    productId: product._id,
    variantId: variant._id,
    quantityOnHand: 10,
    quantityReserved: 0,
    quantityAvailable: 10,
    reorderLevel: 2,
    reorderQuantity: 5,
  });

  await TaxRuleModel.create({
    name: "Phase 9 NJ Tax",
    country: "USA",
    state: "NJ",
    taxClassification: "GROCERY",
    rateBasisPoints: 700,
    isActive: true,
  });

  await addCartItem(owner, { storeId, productId, variantId, quantity: 2 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

describe("Phase 9 order service", () => {
  it("creates an idempotent order snapshot, links payment and reserves inventory", async () => {
    const review = await buildCheckoutReview(owner, {
      storeId,
      fulfillmentType: "PICKUP",
      pickupSlotId,
      guest: { firstName: "Riya", lastName: "Shah", email: "riya@example.com", phone: "555-0199" },
      customerNotes: "Phase 9 order",
    });

    const payment = await PaymentModel.create({
      customerId: null,
      guestTokenHash: "test-guest-hash",
      cartId: review.cart.id ? new Types.ObjectId(review.cart.id) : null,
      storeId: new Types.ObjectId(storeId),
      provider: "STRIPE",
      checkoutFingerprint: "a".repeat(64),
      currency: review.totals.currency,
      amountMinor: review.totals.totalMinor,
      authorizedAmountMinor: 0,
      capturedAmountMinor: 0,
      refundedAmountMinor: 0,
      captureMethod: "AUTOMATIC",
      status: "PENDING",
      customerEmail: review.identity.contact.email,
      fulfillmentType: review.fulfillment.type,
    });

    const first = await ensureOrderForPayment(payment.id, owner, review);
    const second = await ensureOrderForPayment(payment.id, owner, review);

    expect(first.id).toBe(second.id);
    expect(first.orderNumber).toMatch(/^GR-\d{8}-[A-F0-9]{8}$/);
    expect(first.items[0]?.productName).toBe("Phase 9 Rice");
    expect(first.items[0]?.sku).toBe("P9-RICE-1");
    expect(await OrderModel.countDocuments()).toBe(1);

    const linkedPayment = await PaymentModel.findById(payment._id).lean();
    expect(linkedPayment?.orderId?.toString()).toBe(first.id);

    const inventory = await InventoryModel.findOne({ storeId, productId, variantId }).lean();
    expect(inventory?.quantityReserved).toBe(2);
    expect(inventory?.quantityAvailable).toBe(8);
    expect(await InventoryTransactionModel.countDocuments({ type: "ORDER_RESERVATION" })).toBe(1);
    expect(await OrderStatusHistoryModel.countDocuments({ orderId: first.id })).toBe(1);

    const bookedPickupSlot = await PickupSlotModel.findById(pickupSlotId).lean();
    expect(bookedPickupSlot?.bookedCount).toBe(1);

    payment.status = "FAILED";
    await payment.save();
    const failed = await syncOrderFromPayment(payment.id, "SYSTEM");
    expect(failed?.orderStatus).toBe("PAYMENT_FAILED");
    expect(failed?.inventoryReservationStatus).toBe("RELEASED");

    const inventoryAfterFailure = await InventoryModel.findOne({ storeId, productId, variantId }).lean();
    expect(inventoryAfterFailure?.quantityReserved).toBe(0);
    expect(inventoryAfterFailure?.quantityAvailable).toBe(10);

    const releasedPickupSlotAfterFailure = await PickupSlotModel.findById(pickupSlotId).lean();
    expect(releasedPickupSlotAfterFailure?.bookedCount).toBe(0);

    const retried = await ensureOrderForPayment(payment.id, owner, review);
    expect(retried.id).toBe(first.id);
    expect(retried.orderStatus).toBe("PENDING_PAYMENT");
    expect(retried.inventoryReservationStatus).toBe("ACTIVE");

    const rebookedPickupSlot = await PickupSlotModel.findById(pickupSlotId).lean();
    expect(rebookedPickupSlot?.bookedCount).toBe(1);

    payment.status = "SUCCEEDED";
    payment.providerPaymentIntentId = "pi_phase9_order";
    payment.authorizedAmountMinor = payment.amountMinor;
    payment.capturedAmountMinor = payment.amountMinor;
    await payment.save();

    const synced = await syncOrderFromPayment(payment.id, "STRIPE");
    expect(synced?.orderStatus).toBe("CONFIRMED");
    expect(synced?.paymentStatus).toBe("SUCCEEDED");

    const cart = await getCartQuote(owner, storeId);
    expect(cart.items).toHaveLength(0);

    const cancelled = await cancelOrderRecord(
      first.id,
      { actorType: "ADMIN", actorId: new Types.ObjectId().toString(), roleNames: ["SUPER_ADMIN"] },
      "Phase 9 cancellation",
    );
    expect(cancelled.orderStatus).toBe("CANCELLED");
    expect(cancelled.inventoryReservationStatus).toBe("RELEASED");

    const releasedInventory = await InventoryModel.findOne({ storeId, productId, variantId }).lean();
    expect(releasedInventory?.quantityReserved).toBe(0);
    expect(releasedInventory?.quantityAvailable).toBe(10);
    expect(await InventoryTransactionModel.countDocuments({ type: "ORDER_RELEASE" })).toBe(2);

    const releasedPickupSlot = await PickupSlotModel.findById(pickupSlotId).lean();
    expect(releasedPickupSlot?.bookedCount).toBe(0);
  });
});
