import { Types } from "mongoose";
import type { z } from "zod";

import { getCartQuote, type CartOwner } from "../carts/cart.service.js";
import { CustomerModel } from "../customers/customer.model.js";
import { quoteValueRedemptions } from "../customer-value/customer-value.service.js";
import { quoteDeliverySelection } from "../delivery/delivery.service.js";
import { quotePickupSelection } from "../pickup/pickup.service.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { ApiError } from "../../utils/api-error.js";
import { taxService } from "./tax.service.js";
import type { checkoutReviewSchema } from "./checkout.validation.js";

type CheckoutReviewInput = z.infer<typeof checkoutReviewSchema>;

function serializeAddress(address: {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryInstructions?: string;
}) {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    deliveryInstructions: address.deliveryInstructions ?? "",
  };
}

async function checkoutIdentity(owner: CartOwner, input: CheckoutReviewInput) {
  if (owner.customerId) {
    const customer = await CustomerModel.findOne({
      _id: owner.customerId,
      isActive: true,
    }).lean();

    if (!customer) {
      throw new ApiError(401, "AUTH_REQUIRED", "Customer authentication is required.");
    }

    const phone = customer.phone.trim();
    if (phone.length < 3) {
      throw new ApiError(
        400,
        "CHECKOUT_PHONE_REQUIRED",
        "Add a valid phone number to your customer profile before checkout.",
      );
    }

    let address = null;
    if (input.fulfillmentType === "DELIVERY") {
      const selected = input.addressId
        ? customer.addresses.find((item) => item._id.toString() === input.addressId)
        : customer.addresses.find((item) => item.isDefault) ?? customer.addresses[0];

      if (!selected) {
        throw new ApiError(
          400,
          "DELIVERY_ADDRESS_REQUIRED",
          "Select or create a delivery address before reviewing checkout.",
        );
      }
      address = serializeAddress(selected);
    }

    return {
      kind: "CUSTOMER" as const,
      customerId: customer._id.toString(),
      contact: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone,
      },
      address,
    };
  }

  if (!input.guest) {
    throw new ApiError(
      400,
      "GUEST_CONTACT_REQUIRED",
      "Guest contact information is required.",
    );
  }

  if (input.fulfillmentType === "DELIVERY" && !input.deliveryAddress) {
    throw new ApiError(
      400,
      "DELIVERY_ADDRESS_REQUIRED",
      "A delivery address is required for guest checkout.",
    );
  }

  return {
    kind: "GUEST" as const,
    customerId: null,
    contact: input.guest,
    address: input.deliveryAddress ? serializeAddress(input.deliveryAddress) : null,
  };
}

export async function buildCheckoutReview(owner: CartOwner, input: CheckoutReviewInput) {
  const [cart, store, identity] = await Promise.all([
    getCartQuote(owner, input.storeId),
    StoreLocationModel.findOne({ _id: new Types.ObjectId(input.storeId), status: "ACTIVE" }).lean(),
    checkoutIdentity(owner, input),
  ]);

  if (!store) {
    throw new ApiError(404, "STORE_NOT_FOUND", "The selected store is not available.");
  }

  if (!cart.canCheckout) {
    throw new ApiError(
      409,
      "CART_REQUIRES_ATTENTION",
      cart.issues.join(" ") || "Cart must be corrected before checkout.",
    );
  }

  if (input.fulfillmentType === "DELIVERY" && !store.deliveryEnabled) {
    throw new ApiError(409, "DELIVERY_NOT_AVAILABLE", "Delivery is not enabled for this store.");
  }

  if (input.fulfillmentType === "PICKUP" && !store.pickupEnabled) {
    throw new ApiError(409, "PICKUP_NOT_AVAILABLE", "Pickup is not enabled for this store.");
  }

  const unsupportedItem = cart.items.find((item) =>
    input.fulfillmentType === "DELIVERY"
      ? !item.availability.deliveryEnabled
      : !item.availability.pickupEnabled,
  );

  if (unsupportedItem) {
    throw new ApiError(
      409,
      "FULFILLMENT_NOT_AVAILABLE_FOR_ITEM",
      "One or more cart items do not support the selected fulfillment method.",
    );
  }

  const taxableBaseMinor = Math.max(
    0,
    cart.totals.subtotalMinor - cart.totals.discountMinor,
  );
  const taxableSubtotal = cart.totals.subtotalMinor || 1;
  const taxAddress = identity.address
    ? {
        country: identity.address.country,
        state: identity.address.state,
        city: identity.address.city,
        postalCode: identity.address.postalCode,
      }
    : {
        country: store.address.country,
        state: store.address.state,
        city: store.address.city,
        postalCode: store.address.postalCode,
      };

  const tax = await taxService.quote({
    currency: cart.totals.currency,
    address: taxAddress,
    lines: cart.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      taxClassification: item.product?.taxClassification ?? "",
      taxableAmountMinor: Math.round(
        taxableBaseMinor * (item.lineSubtotalMinor / taxableSubtotal),
      ),
      quantity: item.quantity,
    })),
  });

  const substitutionPreferenceMap = new Map(
    (input.substitutionPreferences ?? []).map((entry) => [
      `${entry.productId}:${entry.variantId}`,
      entry.preference,
    ]),
  );

  const substitutionPreferences = cart.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    preference:
      substitutionPreferenceMap.get(`${item.productId}:${item.variantId}`) ??
      "BEST_AVAILABLE" as const,
  }));

  const merchandiseMinor = Math.max(0, cart.totals.subtotalMinor - cart.totals.discountMinor);
  const deliveryQuote = input.fulfillmentType === "DELIVERY"
    ? await quoteDeliverySelection({
        storeId: input.storeId,
        postalCode: identity.address?.postalCode ?? "",
        merchandiseMinor,
        slotId: input.deliverySlotId,
      })
    : null;
  const pickupSlot = input.fulfillmentType === "PICKUP"
    ? await quotePickupSelection(input.storeId, input.pickupSlotId)
    : null;

  if (input.fulfillmentType === "DELIVERY" && !deliveryQuote?.slot) {
    throw new ApiError(400, "DELIVERY_SLOT_REQUIRED", "Select an available delivery slot before reviewing checkout.");
  }
  if (input.fulfillmentType === "PICKUP" && !pickupSlot) {
    throw new ApiError(400, "PICKUP_SLOT_REQUIRED", "Select an available pickup slot before reviewing checkout.");
  }

  const deliveryFeeMinor = cart.promotions.freeDelivery
    ? 0
    : deliveryQuote?.feeMinor ?? 0;
  const preValueTotalMinor = Math.max(
    0,
    merchandiseMinor + tax.amountMinor + deliveryFeeMinor,
  );
  const valueRedemptions = await quoteValueRedemptions({
    customerId: identity.customerId ?? undefined,
    currency: cart.totals.currency,
    totalMinor: preValueTotalMinor,
    requested: input.valueRedemptions ?? { loyaltyPoints: 0, storeCreditMinor: 0, giftCardMinor: 0 },
  });
  const totalMinor = Math.max(0, preValueTotalMinor - valueRedemptions.totalMinor);

  return {
    cart,
    identity,
    fulfillment: {
      type: input.fulfillmentType,
      store: {
        id: store._id.toString(),
        name: store.name,
        code: store.code,
        timezone: store.timezone,
      },
      deliveryAddress: identity.address,
      deliveryZone: deliveryQuote?.zone ?? null,
      deliveryFee: {
        amountMinor: deliveryFeeMinor,
        status: input.fulfillmentType === "DELIVERY" ? "CONFIGURED" as const : "NOT_APPLICABLE" as const,
        message: input.fulfillmentType === "DELIVERY"
          ? deliveryFeeMinor === 0
            ? cart.promotions.freeDelivery
              ? "Delivery fee waived by an active promotion."
              : "Delivery fee waived for this order."
            : "Delivery fee calculated from the selected delivery zone."
          : "Pickup does not have a delivery fee.",
      },
      slot: {
        selected: deliveryQuote?.slot ?? pickupSlot,
        status: "SELECTED" as const,
      },
    },
    tax,
    totals: {
      currency: cart.totals.currency,
      subtotalMinor: cart.totals.subtotalMinor,
      discountMinor: cart.totals.discountMinor,
      taxMinor: tax.amountMinor,
      deliveryFeeMinor,
      preValueTotalMinor,
      customerValueMinor: valueRedemptions.totalMinor,
      totalMinor,
    },
    valueRedemptions,
    customerNotes: input.customerNotes,
    substitutionPreferences,
    payment: {
      status: "READY_FOR_PAYMENT" as const,
      readyForPayment: true,
      captureMethod: cart.items.some(
        (item) => item.product?.productType === "VARIABLE_WEIGHT",
      )
        ? "MANUAL" as const
        : "AUTOMATIC" as const,
      message: totalMinor > 0
        ? "Checkout is ready for Stripe PaymentIntent creation using backend-authoritative totals."
        : "Checkout is fully covered by customer-value redemptions; no Stripe charge is required.",
    },
  };
}

export type CheckoutReview = Awaited<ReturnType<typeof buildCheckoutReview>>;
