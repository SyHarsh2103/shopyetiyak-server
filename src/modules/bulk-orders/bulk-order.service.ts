import mongoose, { type ClientSession, Types } from "mongoose";
import { randomBytes } from "node:crypto";
import type { z } from "zod";

import {
  reserveDeliverySlotInSession,
  quoteDeliverySelection,
} from "../delivery/delivery.service.js";
import { reserveInventoryInSession } from "../inventory/inventory.service.js";
import { OrderStatusHistoryModel } from "../orders/order-status-history.model.js";
import { OrderModel } from "../orders/order.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { StripeWebhookEventModel } from "../payments/stripe-webhook-event.model.js";
import {
  StripeGatewayError,
  stripeGateway,
  type StripeGateway,
  type StripePaymentIntentSnapshot,
  type StripeWebhookSnapshot,
} from "../payments/stripe.gateway.js";
import {
  quotePickupSelection,
  reservePickupSlotInSession,
} from "../pickup/pickup.service.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { env } from "../../config/env.js";
import { sendEmail } from "../../services/email/email.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createOpaqueToken,
  sha256,
} from "../../utils/crypto.js";
import { BulkOrderRequestModel } from "./bulk-order-request.model.js";
import { QuoteDepositPaymentModel } from "./quote-deposit.model.js";
import { QuoteModel } from "./quote.model.js";
import type {
  bulkRequestListQuerySchema,
  createBulkOrderRequestSchema,
  createQuoteSchema,
  quoteConversionSchema,
  quoteListQuerySchema,
  updateBulkRequestSchema,
  updateQuoteSchema,
} from "./bulk-order.validation.js";

type CreateRequestInput = z.infer<
  typeof createBulkOrderRequestSchema
>;

type RequestListQuery = z.infer<
  typeof bulkRequestListQuerySchema
>;

type UpdateRequestInput = z.infer<
  typeof updateBulkRequestSchema
>;

type CreateQuoteInput = z.infer<
  typeof createQuoteSchema
>;

type UpdateQuoteInput = z.infer<
  typeof updateQuoteSchema
>;

type QuoteListQuery = z.infer<
  typeof quoteListQuerySchema
>;

type QuoteConversionInput = z.infer<
  typeof quoteConversionSchema
>;

export interface BulkOrderAdminActor {
  adminUserId: string;
  roleNames: string[];
}

function requestNumber(): string {
  const now = new Date();

  const date =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;

  return `BR-${date}-${randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function quoteNumber(): string {
  const now = new Date();

  const date =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;

  return `QT-${date}-${randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function orderNumber(): string {
  const now = new Date();

  const date =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;

  return `GR-${date}-${randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function isDuplicateKeyError(
  error: unknown,
): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function stripeStatus(
  intent: StripePaymentIntentSnapshot,
) {
  switch (intent.status) {
    case "requires_action":
      return "REQUIRES_ACTION" as const;

    case "processing":
      return "PROCESSING" as const;

    case "canceled":
      return "CANCELLED" as const;

    case "succeeded":
      return "SUCCEEDED" as const;

    case "requires_payment_method":
      return intent.lastPaymentError
        ? ("FAILED" as const)
        : ("PENDING" as const);

    case "requires_confirmation":
      return "PENDING" as const;

    case "requires_capture":
      return "REQUIRES_ACTION" as const;
  }
}

function serializeRequest(
  record: {
    _id: Types.ObjectId;
    requestNumber: string;
    requestType: string;
    customerId?: Types.ObjectId | null;
    contact: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    eventDate: Date;
    guestCount: number;
    budgetMinor?: number | null;
    currency: string;
    productsRequired: string;
    deliveryAddress: {
      recipientName: string;
      phone: string;
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    specialInstructions: string;
    status: string;
    activeQuoteId?: Types.ObjectId | null;
    internalNotes: string;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id: record._id.toString(),
    requestNumber: record.requestNumber,
    requestType: record.requestType,
    customerId:
      record.customerId?.toString() ?? null,
    contact: record.contact,
    eventDate:
      record.eventDate.toISOString(),
    guestCount: record.guestCount,
    budgetMinor:
      record.budgetMinor ?? null,
    currency: record.currency,
    productsRequired:
      record.productsRequired,
    deliveryAddress:
      record.deliveryAddress,
    specialInstructions:
      record.specialInstructions,
    status: record.status,
    activeQuoteId:
      record.activeQuoteId?.toString() ??
      null,
    internalNotes:
      record.internalNotes,
    createdAt:
      record.createdAt.toISOString(),
    updatedAt:
      record.updatedAt.toISOString(),
  };
}

function serializeQuote(
  record: {
    _id: Types.ObjectId;
    quoteNumber: string;
    requestId: Types.ObjectId;
    customerId?: Types.ObjectId | null;
    contactSnapshot: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    storeId: Types.ObjectId;
    currency: string;
    lines: Array<{
      _id: Types.ObjectId;
      lineType: string;
      productId?: Types.ObjectId | null;
      variantId?: Types.ObjectId | null;
      productNameSnapshot: string;
      productSlugSnapshot: string;
      skuSnapshot: string;
      description: string;
      quantity: number;
      unitPriceMinor: number;
      lineSubtotalMinor: number;
    }>;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    deliveryFeeMinor: number;
    totalMinor: number;
    depositMode: string;
    depositFixedMinor?: number | null;
    depositPercentBasisPoints?: number | null;
    depositAmountMinor: number;
    depositPaidMinor: number;
    status: string;
    validUntil: Date;
    customerMessage: string;
    internalNotes: string;
    accessTokenLastFour: string;
    sentAt?: Date | null;
    acceptedAt?: Date | null;
    depositPaidAt?: Date | null;
    convertedAt?: Date | null;
    convertedOrderId?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id: record._id.toString(),
    quoteNumber:
      record.quoteNumber,
    requestId:
      record.requestId.toString(),
    customerId:
      record.customerId?.toString() ??
      null,
    contact:
      record.contactSnapshot,
    storeId:
      record.storeId.toString(),
    currency:
      record.currency,

    lines:
      record.lines.map(
        (line) => ({
          id:
            line._id.toString(),
          lineType:
            line.lineType,
          productId:
            line.productId?.toString() ??
            null,
          variantId:
            line.variantId?.toString() ??
            null,
          productName:
            line.productNameSnapshot,
          productSlug:
            line.productSlugSnapshot,
          sku:
            line.skuSnapshot,
          description:
            line.description,
          quantity:
            line.quantity,
          unitPriceMinor:
            line.unitPriceMinor,
          lineSubtotalMinor:
            line.lineSubtotalMinor,
        }),
      ),

    pricing: {
      subtotalMinor:
        record.subtotalMinor,
      discountMinor:
        record.discountMinor,
      taxMinor:
        record.taxMinor,
      deliveryFeeMinor:
        record.deliveryFeeMinor,
      totalMinor:
        record.totalMinor,
      currency:
        record.currency,
    },

    deposit: {
      mode:
        record.depositMode,
      fixedMinor:
        record.depositFixedMinor ??
        null,
      percentBasisPoints:
        record.depositPercentBasisPoints ??
        null,
      amountMinor:
        record.depositAmountMinor,
      paidMinor:
        record.depositPaidMinor,
    },

    status:
      record.status,

    validUntil:
      record.validUntil.toISOString(),

    customerMessage:
      record.customerMessage,

    internalNotes:
      record.internalNotes,

    accessTokenLastFour:
      record.accessTokenLastFour,

    sentAt:
      record.sentAt?.toISOString() ??
      null,

    acceptedAt:
      record.acceptedAt?.toISOString() ??
      null,

    depositPaidAt:
      record.depositPaidAt?.toISOString() ??
      null,

    convertedAt:
      record.convertedAt?.toISOString() ??
      null,

    convertedOrderId:
      record.convertedOrderId?.toString() ??
      null,

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

function serializeDeposit(
  record: {
    _id: Types.ObjectId;
    quoteId: Types.ObjectId;
    providerPaymentIntentId?: string | null;
    currency: string;
    amountMinor: number;
    status: string;
    lastError?: {
      code: string;
      message: string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id:
      record._id.toString(),

    quoteId:
      record.quoteId.toString(),

    provider:
      "STRIPE" as const,

    providerPaymentIntentId:
      record.providerPaymentIntentId ??
      "",

    currency:
      record.currency,

    amountMinor:
      record.amountMinor,

    status:
      record.status,

    lastError:
      record.lastError ??
      null,

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

function computeDeposit(
  input: {
    mode:
      | "NONE"
      | "FIXED"
      | "PERCENTAGE";

    fixedMinor:
      number | null;

    percentBasisPoints:
      number | null;

    totalMinor:
      number;
  },
): number {
  if (
    input.mode ===
    "NONE"
  ) {
    return 0;
  }

  if (
    input.mode ===
    "FIXED"
  ) {
    return Math.min(
      input.totalMinor,
      input.fixedMinor ?? 0,
    );
  }

  return Math.min(
    input.totalMinor,
    Math.max(
      0,
      Math.round(
        input.totalMinor *
          (
            (
              input.percentBasisPoints ??
              0
            ) /
            10_000
          ),
      ),
    ),
  );
}

async function snapshotQuoteLines(
  lines: CreateQuoteInput["lines"],
) {
  const productIds = [
    ...new Set(
      lines.flatMap(
        (line) =>
          line.productId
            ? [
                line.productId,
              ]
            : [],
      ),
    ),
  ];

  const products =
    productIds.length > 0
      ? await ProductModel.find({
          _id: {
            $in:
              productIds,
          },

          archivedAt:
            null,
        }).lean()
      : [];

  const productMap =
    new Map(
      products.map(
        (product) => [
          product._id.toString(),
          product,
        ],
      ),
    );

  return lines.map(
    (line) => {
      if (
        line.lineType ===
        "CUSTOM"
      ) {
        return {
          lineType:
            "CUSTOM" as const,

          productId:
            null,

          variantId:
            null,

          productNameSnapshot:
            "",

          productSlugSnapshot:
            "",

          skuSnapshot:
            "",

          productTypeSnapshot:
            "",

          sellingUnitSnapshot:
            "",

          unitQuantitySnapshot:
            1,

          attributesSnapshot:
            [],

          imageSnapshot:
            null,

          description:
            line.description,

          quantity:
            line.quantity,

          unitPriceMinor:
            line.unitPriceMinor,

          lineSubtotalMinor:
            Math.max(
              0,
              Math.round(
                line.unitPriceMinor *
                  line.quantity,
              ),
            ),
        };
      }

      const product =
        line.productId
          ? productMap.get(
              line.productId,
            )
          : undefined;

      const variant =
        product?.variants.find(
          (candidate) =>
            candidate._id.toString() ===
            line.variantId,
        );

      if (
        !product ||
        !variant ||
        !product.isActive ||
        variant.status !==
          "ACTIVE"
      ) {
        throw new ApiError(
          409,
          "QUOTE_PRODUCT_UNAVAILABLE",
          "One or more quoted product variants are not active.",
        );
      }

      const primaryImage =
        product.images.find(
          (image) =>
            image.isPrimary,
        ) ??
        product.images[0] ??
        null;

      return {
        lineType:
          "PRODUCT" as const,

        productId:
          product._id,

        variantId:
          variant._id,

        productNameSnapshot:
          product.name,

        productSlugSnapshot:
          product.slug,

        skuSnapshot:
          variant.sku,

        productTypeSnapshot:
          product.productType,

        sellingUnitSnapshot:
          variant.sellingUnit,

        unitQuantitySnapshot:
          variant.unitQuantity,

        attributesSnapshot:
          variant.attributes,

        imageSnapshot:
          primaryImage
            ? {
                url:
                  primaryImage.url,
                altText:
                  primaryImage.altText,
              }
            : null,

        description:
          line.description ||
          product.name,

        quantity:
          line.quantity,

        unitPriceMinor:
          line.unitPriceMinor,

        lineSubtotalMinor:
          Math.max(
            0,
            Math.round(
              line.unitPriceMinor *
                line.quantity,
            ),
          ),
      };
    },
  );
}

async function requirePublicQuote(
  quoteId: string,
  token: string,
) {
  const quote =
    await QuoteModel.findById(
      quoteId,
    ).select(
      "+accessTokenHash",
    );

  if (
    !quote ||
    !quote.accessTokenHash ||
    sha256(token) !==
      quote.accessTokenHash
  ) {
    throw new ApiError(
      404,
      "QUOTE_NOT_FOUND",
      "Quote was not found or the access link is invalid.",
    );
  }

  if (
    quote.validUntil.getTime() <
      Date.now() &&
    ![
      "DEPOSIT_PAID",
      "CONVERTED_TO_ORDER",
    ].includes(
      quote.status,
    )
  ) {
    quote.status =
      "EXPIRED";

    await quote.save();

    throw new ApiError(
      410,
      "QUOTE_EXPIRED",
      "This quote has expired.",
    );
  }

  return quote;
}

async function validateQuoteProductsForConversion(
  storeId: string,
  fulfillmentType:
    | "DELIVERY"
    | "PICKUP",
  productLines: Array<{
    productId?: Types.ObjectId | null;
    variantId?: Types.ObjectId | null;
    quantity: number;
  }>,
): Promise<void> {
  const productIds = [
    ...new Set(
      productLines.flatMap(
        (line) =>
          line.productId
            ? [
                line.productId.toString(),
              ]
            : [],
      ),
    ),
  ];

  const [
    products,
    storeProducts,
  ] = await Promise.all([
    ProductModel.find({
      _id: {
        $in:
          productIds,
      },

      isActive:
        true,

      archivedAt:
        null,
    }).lean(),

    StoreProductModel.find({
      storeId,

      productId: {
        $in:
          productIds,
      },
    }).lean(),
  ]);

  const productMap =
    new Map(
      products.map(
        (product) => [
          product._id.toString(),
          product,
        ],
      ),
    );

  const storeProductMap =
    new Map(
      storeProducts.map(
        (record) => [
          record.productId.toString(),
          record,
        ],
      ),
    );

  for (
    const line of
      productLines
  ) {
    const productId =
      line.productId?.toString() ??
      "";

    const variantId =
      line.variantId?.toString() ??
      "";

    const product =
      productMap.get(
        productId,
      );

    const variant =
      product?.variants.find(
        (candidate) =>
          candidate._id.toString() ===
          variantId,
      );

    if (
      !product ||
      !variant ||
      variant.status !==
        "ACTIVE"
    ) {
      throw new ApiError(
        409,
        "QUOTE_PRODUCT_UNAVAILABLE",
        "One or more quoted product variants are no longer active.",
      );
    }

    const storeProduct =
      storeProductMap.get(
        productId,
      );

    if (
      storeProduct &&
      !storeProduct.isAvailable
    ) {
      throw new ApiError(
        409,
        "QUOTE_PRODUCT_STORE_UNAVAILABLE",
        "One or more quoted products are no longer available at the selected store.",
      );
    }

    if (
      fulfillmentType ===
        "DELIVERY" &&
      storeProduct &&
      !storeProduct.deliveryEnabled
    ) {
      throw new ApiError(
        409,
        "QUOTE_PRODUCT_DELIVERY_UNAVAILABLE",
        "One or more quoted products are not eligible for delivery at the selected store.",
      );
    }

    if (
      fulfillmentType ===
        "PICKUP" &&
      storeProduct &&
      !storeProduct.pickupEnabled
    ) {
      throw new ApiError(
        409,
        "QUOTE_PRODUCT_PICKUP_UNAVAILABLE",
        "One or more quoted products are not eligible for pickup at the selected store.",
      );
    }

    const minimum =
      variant.minimumQuantity ??
      1;

    const maximum =
      variant.maximumQuantity ??
      null;

    const increment =
      variant.quantityIncrement ??
      1;

    const steps =
      (
        line.quantity -
        minimum
      ) /
      increment;

    const incrementValid =
      Math.abs(
        steps -
          Math.round(
            steps,
          ),
      ) <= 1e-9;

    if (
      line.quantity <
        minimum ||
      (
        maximum !==
          null &&
        line.quantity >
          maximum
      ) ||
      !incrementValid
    ) {
      throw new ApiError(
        409,
        "QUOTE_PRODUCT_QUANTITY_INVALID",
        "A quoted product quantity no longer satisfies the product ordering rules.",
      );
    }
  }
}

function providerFailure(
  error: unknown,
): ApiError {
  if (
    error instanceof
    StripeGatewayError
  ) {
    const status =
      error.code ===
      "STRIPE_NOT_CONFIGURED"
        ? 503
        : 502;

    return new ApiError(
      status,
      error.code,
      error.message,
    );
  }

  return new ApiError(
    502,
    "STRIPE_REQUEST_FAILED",
    "Stripe could not process the request.",
  );
}

function paymentSummary(
  payment: {
    _id: Types.ObjectId;
    orderId?: Types.ObjectId | null;
    providerPaymentIntentId?: string | null;
    currency: string;
    amountMinor: number;
    authorizedAmountMinor: number;
    capturedAmountMinor: number;
    refundedAmountMinor: number;
    captureMethod: string;
    status: string;
    fulfillmentType: string;
    lastError?: {
      code: string;
      message: string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id:
      payment._id.toString(),

    orderId:
      payment.orderId?.toString() ??
      null,

    provider:
      "STRIPE" as const,

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

    fulfillmentType:
      payment.fulfillmentType,

    lastError:
      payment.lastError ??
      null,

    createdAt:
      payment.createdAt.toISOString(),

    updatedAt:
      payment.updatedAt.toISOString(),
  };
}

function allocate(
  totalMinor: number,
  subtotals: number[],
): number[] {
  const totalSubtotal =
    subtotals.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    );

  if (
    totalMinor <= 0 ||
    totalSubtotal <= 0
  ) {
    return subtotals.map(
      () => 0,
    );
  }

  let allocated =
    0;

  return subtotals.map(
    (
      subtotal,
      index,
    ) => {
      if (
        index ===
        subtotals.length -
          1
      ) {
        return Math.max(
          0,
          totalMinor -
            allocated,
        );
      }

      const value =
        Math.min(
          subtotal,
          Math.max(
            0,
            Math.round(
              totalMinor *
                (
                  subtotal /
                  totalSubtotal
                ),
            ),
          ),
        );

      allocated +=
        value;

      return value;
    },
  );
}

export class BulkOrderService {
  constructor(
    private readonly gateway: StripeGateway =
      stripeGateway,
  ) {}

  async createRequest(
    input: CreateRequestInput,
    customerId?: string,
  ) {
    const record =
      await BulkOrderRequestModel.create({
        requestNumber:
          requestNumber(),

        requestType:
          input.requestType,

        customerId:
          customerId
            ? new Types.ObjectId(
                customerId,
              )
            : null,

        contact:
          input.contact,

        eventDate:
          new Date(
            input.eventDate,
          ),

        guestCount:
          input.guestCount,

        budgetMinor:
          input.budgetMinor,

        currency:
          input.currency,

        productsRequired:
          input.productsRequired,

        deliveryAddress:
          input.deliveryAddress,

        specialInstructions:
          input.specialInstructions,

        status:
          "NEW_REQUEST",
      });

    return serializeRequest(
      record,
    );
  }

  async listRequests(
    query: RequestListQuery,
  ) {
    const filter: Record<
      string,
      unknown
    > = {};

    if (
      query.requestType
    ) {
      filter.requestType =
        query.requestType;
    }

    if (
      query.status
    ) {
      filter.status =
        query.status;
    }

    if (
      query.search
    ) {
      filter.$or = [
        {
          requestNumber: {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
        {
          "contact.email": {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
        {
          "contact.firstName": {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
        {
          "contact.lastName": {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
      ];
    }

    const [
      records,
      total,
    ] = await Promise.all([
      BulkOrderRequestModel.find(
        filter,
      )
        .sort({
          createdAt:
            -1,
        })
        .skip(
          (
            query.page -
            1
          ) *
            query.limit,
        )
        .limit(
          query.limit,
        ),

      BulkOrderRequestModel.countDocuments(
        filter,
      ),
    ]);

    return {
      items:
        records.map(
          serializeRequest,
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

  async updateRequest(
    id: string,
    input: UpdateRequestInput,
  ) {
    const record =
      await BulkOrderRequestModel.findById(
        id,
      );

    if (!record) {
      throw new ApiError(
        404,
        "BULK_REQUEST_NOT_FOUND",
        "Bulk-order request was not found.",
      );
    }

    if (
      input.status !==
      undefined
    ) {
      record.status =
        input.status;
    }

    if (
      input.internalNotes !==
      undefined
    ) {
      record.internalNotes =
        input.internalNotes;
    }

    await record.save();

    return serializeRequest(
      record,
    );
  }

  async createQuote(
    input: CreateQuoteInput,
  ) {
    const request =
      await BulkOrderRequestModel.findById(
        input.requestId,
      );

    if (!request) {
      throw new ApiError(
        404,
        "BULK_REQUEST_NOT_FOUND",
        "Bulk-order request was not found.",
      );
    }

    const store =
      await StoreLocationModel.findOne({
        _id:
          input.storeId,

        status:
          "ACTIVE",
      }).lean();

    if (!store) {
      throw new ApiError(
        404,
        "STORE_NOT_FOUND",
        "The selected store is not available.",
      );
    }

    const lines =
      await snapshotQuoteLines(
        input.lines,
      );

    const subtotalMinor =
      lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.lineSubtotalMinor,
        0,
      );

    if (
      input.discountMinor >
      subtotalMinor
    ) {
      throw new ApiError(
        400,
        "QUOTE_DISCOUNT_TOO_HIGH",
        "Quote discount cannot exceed the subtotal.",
      );
    }

    const totalMinor =
      Math.max(
        0,
        subtotalMinor -
          input.discountMinor +
          input.taxMinor +
          input.deliveryFeeMinor,
      );

    const depositAmountMinor =
      computeDeposit({
        mode:
          input.depositMode,

        fixedMinor:
          input.depositFixedMinor,

        percentBasisPoints:
          input.depositPercentBasisPoints,

        totalMinor,
      });

    const quote =
      await QuoteModel.create({
        quoteNumber:
          quoteNumber(),

        requestId:
          request._id,

        customerId:
          request.customerId ??
          null,

        contactSnapshot:
          request.contact,

        storeId:
          new Types.ObjectId(
            input.storeId,
          ),

        currency:
          input.currency,

        lines,

        subtotalMinor,

        discountMinor:
          input.discountMinor,

        taxMinor:
          input.taxMinor,

        deliveryFeeMinor:
          input.deliveryFeeMinor,

        totalMinor,

        depositMode:
          input.depositMode,

        depositFixedMinor:
          input.depositFixedMinor,

        depositPercentBasisPoints:
          input.depositPercentBasisPoints,

        depositAmountMinor,

        depositPaidMinor:
          0,

        status:
          "DRAFT",

        validUntil:
          new Date(
            input.validUntil,
          ),

        customerMessage:
          input.customerMessage,

        internalNotes:
          input.internalNotes,
      });

    request.activeQuoteId =
      quote._id;

    request.status =
      "QUOTE_PREPARATION";

    await request.save();

    return serializeQuote(
      quote,
    );
  }

  async listQuotes(
    query: QuoteListQuery,
  ) {
    const filter: Record<
      string,
      unknown
    > = {};

    if (
      query.status
    ) {
      filter.status =
        query.status;
    }

    if (
      query.requestId
    ) {
      filter.requestId =
        new Types.ObjectId(
          query.requestId,
        );
    }

    if (
      query.search
    ) {
      filter.$or = [
        {
          quoteNumber: {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
        {
          "contactSnapshot.email": {
            $regex:
              query.search,
            $options:
              "i",
          },
        },
      ];
    }

    const [
      records,
      total,
    ] = await Promise.all([
      QuoteModel.find(
        filter,
      )
        .sort({
          createdAt:
            -1,
        })
        .skip(
          (
            query.page -
            1
          ) *
            query.limit,
        )
        .limit(
          query.limit,
        ),

      QuoteModel.countDocuments(
        filter,
      ),
    ]);

    return {
      items:
        records.map(
          serializeQuote,
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

  async updateQuote(
    id: string,
    input: UpdateQuoteInput,
  ) {
    const quote =
      await QuoteModel.findById(
        id,
      );

    if (!quote) {
      throw new ApiError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote was not found.",
      );
    }

    if (
      quote.status !==
      "DRAFT"
    ) {
      throw new ApiError(
        409,
        "QUOTE_NOT_EDITABLE",
        "Only draft quotes can be edited.",
      );
    }

    if (
      input.storeId
    ) {
      const store =
        await StoreLocationModel.findOne({
          _id:
            input.storeId,

          status:
            "ACTIVE",
        }).lean();

      if (!store) {
        throw new ApiError(
          404,
          "STORE_NOT_FOUND",
          "The selected store is not available.",
        );
      }

      quote.storeId =
        new Types.ObjectId(
          input.storeId,
        );
    }

    if (
      input.currency
    ) {
      quote.currency =
        input.currency;
    }

    if (
      input.lines
    ) {
      quote.set(
        "lines",
        await snapshotQuoteLines(
          input.lines,
        ),
      );
    }

    if (
      input.discountMinor !==
      undefined
    ) {
      quote.discountMinor =
        input.discountMinor;
    }

    if (
      input.taxMinor !==
      undefined
    ) {
      quote.taxMinor =
        input.taxMinor;
    }

    if (
      input.deliveryFeeMinor !==
      undefined
    ) {
      quote.deliveryFeeMinor =
        input.deliveryFeeMinor;
    }

    if (
      input.validUntil
    ) {
      quote.validUntil =
        new Date(
          input.validUntil,
        );
    }

    if (
      input.customerMessage !==
      undefined
    ) {
      quote.customerMessage =
        input.customerMessage;
    }

    if (
      input.internalNotes !==
      undefined
    ) {
      quote.internalNotes =
        input.internalNotes;
    }

    if (
      input.depositMode !==
      undefined
    ) {
      quote.depositMode =
        input.depositMode;
    }

    if (
      input.depositFixedMinor !==
      undefined
    ) {
      quote.depositFixedMinor =
        input.depositFixedMinor;
    }

    if (
      input.depositPercentBasisPoints !==
      undefined
    ) {
      quote.depositPercentBasisPoints =
        input.depositPercentBasisPoints;
    }

    const subtotalMinor =
      quote.lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.lineSubtotalMinor,
        0,
      );

    if (
      quote.discountMinor >
      subtotalMinor
    ) {
      throw new ApiError(
        400,
        "QUOTE_DISCOUNT_TOO_HIGH",
        "Quote discount cannot exceed the subtotal.",
      );
    }

    quote.subtotalMinor =
      subtotalMinor;

    quote.totalMinor =
      Math.max(
        0,
        subtotalMinor -
          quote.discountMinor +
          quote.taxMinor +
          quote.deliveryFeeMinor,
      );

    quote.depositAmountMinor =
      computeDeposit({
        mode:
          quote.depositMode,

        fixedMinor:
          quote.depositFixedMinor ??
          null,

        percentBasisPoints:
          quote.depositPercentBasisPoints ??
          null,

        totalMinor:
          quote.totalMinor,
      });

    await quote.save();

    return serializeQuote(
      quote,
    );
  }

  async cancelQuote(
    id: string,
  ) {
    const quote =
      await QuoteModel.findById(
        id,
      );

    if (!quote) {
      throw new ApiError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote was not found.",
      );
    }

    if (
      quote.convertedOrderId ||
      quote.status ===
        "CONVERTED_TO_ORDER"
    ) {
      throw new ApiError(
        409,
        "QUOTE_ALREADY_CONVERTED",
        "A converted quote cannot be cancelled.",
      );
    }

    if (
      quote.depositPaidMinor >
        0 ||
      quote.status ===
        "DEPOSIT_PAID"
    ) {
      throw new ApiError(
        409,
        "QUOTE_DEPOSIT_REFUND_REQUIRED",
        "A paid quote deposit must be refunded before this quote can be cancelled.",
      );
    }

    if (
      quote.status ===
      "CANCELLED"
    ) {
      return serializeQuote(
        quote,
      );
    }

    if (
      quote.status ===
      "EXPIRED"
    ) {
      throw new ApiError(
        409,
        "QUOTE_ALREADY_EXPIRED",
        "An expired quote cannot be cancelled.",
      );
    }

    quote.status =
      "CANCELLED";

    await quote.save();

    await BulkOrderRequestModel.updateOne(
      {
        _id:
          quote.requestId,
      },
      {
        $set: {
          status:
            "QUOTE_PREPARATION",

          activeQuoteId:
            null,
        },
      },
    );

    return serializeQuote(
      quote,
    );
  }

  async sendQuote(
    id: string,
  ) {
    const quote =
      await QuoteModel.findById(
        id,
      ).select(
        "+accessTokenHash",
      );

    if (!quote) {
      throw new ApiError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote was not found.",
      );
    }

    if (
      quote.status !==
      "DRAFT"
    ) {
      throw new ApiError(
        409,
        "QUOTE_CANNOT_BE_SENT",
        "Only a draft quote can be sent.",
      );
    }

    const token =
      createOpaqueToken();

    const shareUrl =
      `${env.CUSTOMER_APP_URL.replace(/\/$/, "")}` +
      `/quotes/${quote.id}` +
      `?token=${encodeURIComponent(token)}`;

    const formattedTotal =
      `${quote.currency} ` +
      `${(quote.totalMinor / 100).toFixed(2)}`;

    // Persist the private token before SMTP so a successfully delivered link is never invalid.
    // The quote remains DRAFT until SMTP succeeds, making a failed send safely retryable.
    quote.accessTokenHash =
      sha256(token);

    quote.accessTokenLastFour =
      token.slice(-4);

    await quote.save();

    await sendEmail(
      quote.contactSnapshot.email,

      `Your grocery quote ${quote.quoteNumber}`,

      `Hello ${quote.contactSnapshot.firstName},\n\n` +
        `Your quote ${quote.quoteNumber} is ready. ` +
        `Total: ${formattedTotal}.\n\n` +
        `Review and accept it here:\n${shareUrl}\n\n` +
        "This link is private. Please do not forward it.",
    );

    quote.status =
      "SENT";

    quote.sentAt =
      new Date();

    await quote.save();

    await BulkOrderRequestModel.updateOne(
      {
        _id:
          quote.requestId,
      },
      {
        $set: {
          status:
            "QUOTE_SENT",

          activeQuoteId:
            quote._id,
        },
      },
    );

    return {
      quote:
        serializeQuote(
          quote,
        ),

      shareUrl,
    };
  }

  async getPublicQuote(
    id: string,
    token: string,
  ) {
    const quote =
      await requirePublicQuote(
        id,
        token,
      );

    const request =
      await BulkOrderRequestModel.findById(
        quote.requestId,
      ).lean();

    const latestDeposit =
      await QuoteDepositPaymentModel.findOne({
        quoteId:
          quote._id,
      })
        .sort({
          createdAt:
            -1,
        });

    return {
      quote:
        serializeQuote(
          quote,
        ),

      request:
        request
          ? {
              requestNumber:
                request.requestNumber,

              requestType:
                request.requestType,

              eventDate:
                request.eventDate.toISOString(),

              guestCount:
                request.guestCount,

              productsRequired:
                request.productsRequired,

              deliveryAddress:
                request.deliveryAddress,
            }
          : null,

      depositPayment:
        latestDeposit
          ? serializeDeposit(
              latestDeposit,
            )
          : null,
    };
  }

  async acceptQuote(
    id: string,
    token: string,
  ) {
    const quote =
      await requirePublicQuote(
        id,
        token,
      );

    if (
      quote.status ===
        "ACCEPTED" ||
      quote.status ===
        "DEPOSIT_PENDING" ||
      quote.status ===
        "DEPOSIT_PAID" ||
      quote.status ===
        "CONVERTED_TO_ORDER"
    ) {
      return serializeQuote(
        quote,
      );
    }

    if (
      quote.status !==
      "SENT"
    ) {
      throw new ApiError(
        409,
        "QUOTE_NOT_ACCEPTABLE",
        "This quote cannot be accepted in its current status.",
      );
    }

    quote.acceptedAt =
      new Date();

    quote.status =
      quote.depositAmountMinor >
      0
        ? "DEPOSIT_PENDING"
        : "ACCEPTED";

    await quote.save();

    await BulkOrderRequestModel.updateOne(
      {
        _id:
          quote.requestId,
      },
      {
        $set: {
          status:
            quote.depositAmountMinor >
            0
              ? "DEPOSIT_PENDING"
              : "ACCEPTED",
        },
      },
    );

    return serializeQuote(
      quote,
    );
  }

  async createDepositIntent(
    id: string,
    token: string,
    idempotencyKey: string,
  ) {
    const quote =
      await requirePublicQuote(
        id,
        token,
      );

    if (
      ![
        "DEPOSIT_PENDING",
        "DEPOSIT_PAID",
      ].includes(
        quote.status,
      )
    ) {
      throw new ApiError(
        409,
        "QUOTE_DEPOSIT_NOT_READY",
        "Accept the quote before paying the deposit.",
      );
    }

    if (
      quote.depositAmountMinor <=
      0
    ) {
      throw new ApiError(
        409,
        "QUOTE_DEPOSIT_NOT_REQUIRED",
        "This quote does not require a deposit.",
      );
    }

    if (
      quote.depositPaidMinor >=
      quote.depositAmountMinor
    ) {
      const existing =
        await QuoteDepositPaymentModel.findOne({
          quoteId:
            quote._id,

          status:
            "SUCCEEDED",
        })
          .sort({
            createdAt:
              -1,
          });

      return {
        payment:
          existing
            ? serializeDeposit(
                existing,
              )
            : null,

        clientSecret:
          "",
      };
    }

    const idempotencyKeyHash =
      sha256(
        idempotencyKey,
      );

    let deposit =
      await QuoteDepositPaymentModel.findOne({
        idempotencyKeyHash,
      });

    if (
      deposit &&
      deposit.quoteId.toString() !==
        quote.id
    ) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key is already in use.",
      );
    }

    if (!deposit) {
      deposit =
        await QuoteDepositPaymentModel.create({
          quoteId:
            quote._id,

          idempotencyKeyHash,

          currency:
            quote.currency,

          amountMinor:
            quote.depositAmountMinor,

          status:
            "PENDING",

          customerEmail:
            quote.contactSnapshot.email,
        });
    }

    if (
      deposit.providerPaymentIntentId
    ) {
      try {
        const intent =
          await this.gateway.retrievePaymentIntent(
            deposit.providerPaymentIntentId,
          );

        deposit.status =
          stripeStatus(
            intent,
          );

        deposit.lastError =
          intent.lastPaymentError;

        await deposit.save();

        return {
          payment:
            serializeDeposit(
              deposit,
            ),

          clientSecret:
            intent.clientSecret ??
            "",
        };
      } catch (
        error: unknown
      ) {
        throw providerFailure(
          error,
        );
      }
    }

    try {
      const intent =
        await this.gateway.createPaymentIntent(
          {
            amountMinor:
              deposit.amountMinor,

            currency:
              deposit.currency,

            captureMethod:
              "automatic",

            customerEmail:
              deposit.customerEmail,

            metadata: {
              grocery_quote_id:
                quote.id,

              grocery_quote_deposit_id:
                deposit.id,

              payment_context:
                "QUOTE_DEPOSIT",
            },
          },

          `grocery-quote-deposit-${sha256(idempotencyKey)}`,
        );

      deposit.providerPaymentIntentId =
        intent.id;

      deposit.status =
        stripeStatus(
          intent,
        );

      deposit.lastError =
        intent.lastPaymentError;

      await deposit.save();

      return {
        payment:
          serializeDeposit(
            deposit,
          ),

        clientSecret:
          intent.clientSecret ??
          "",
      };
    } catch (
      error: unknown
    ) {
      throw providerFailure(
        error,
      );
    }
  }

  async isQuoteDepositIntent(
    paymentIntentId: string,
  ): Promise<boolean> {
    return Boolean(
      await QuoteDepositPaymentModel.exists({
        providerPaymentIntentId:
          paymentIntentId,
      }),
    );
  }

  async processQuoteDepositWebhook(
    event: StripeWebhookSnapshot,
  ) {
    let duplicate =
      false;

    try {
      await StripeWebhookEventModel.create({
        providerEventId:
          event.id,

        type:
          event.type,

        apiVersion:
          event.apiVersion,

        livemode:
          event.livemode,

        providerCreatedAt:
          event.createdAt,

        paymentIntentId:
          event.paymentIntent?.id ??
          "",

        processingStatus:
          "RECEIVED",
      });
    } catch (
      error: unknown
    ) {
      if (
        !isDuplicateKeyError(
          error,
        )
      ) {
        throw error;
      }

      duplicate =
        true;

      const existing =
        await StripeWebhookEventModel.findOne({
          providerEventId:
            event.id,
        });

      if (!existing) {
        throw error;
      }

      if (
        [
          "PROCESSED",
          "IGNORED",
        ].includes(
          existing.processingStatus,
        )
      ) {
        return {
          duplicate:
            true,

          processed:
            false,
        };
      }

      existing.processingStatus =
        "RECEIVED";

      existing.errorMessage =
        "";

      existing.processedAt =
        null;

      await existing.save();
    }

    if (
      !event.paymentIntent
    ) {
      await StripeWebhookEventModel.updateOne(
        {
          providerEventId:
            event.id,
        },
        {
          $set: {
            processingStatus:
              "IGNORED",

            processedAt:
              new Date(),
          },
        },
      );

      return {
        duplicate,

        processed:
          false,
      };
    }

    const deposit =
      await QuoteDepositPaymentModel.findOne({
        providerPaymentIntentId:
          event.paymentIntent.id,
      });

    if (!deposit) {
      await StripeWebhookEventModel.updateOne(
        {
          providerEventId:
            event.id,
        },
        {
          $set: {
            processingStatus:
              "IGNORED",

            processedAt:
              new Date(),
          },
        },
      );

      return {
        duplicate,

        processed:
          false,
      };
    }

    try {
      deposit.status =
        stripeStatus(
          event.paymentIntent,
        );

      deposit.lastError =
        event.paymentIntent.lastPaymentError;

      await deposit.save();

      if (
        deposit.status ===
        "SUCCEEDED"
      ) {
        const quote =
          await QuoteModel.findById(
            deposit.quoteId,
          );

        if (quote) {
          quote.depositPaidMinor =
            Math.max(
              quote.depositPaidMinor,
              deposit.amountMinor,
            );

          if (
            quote.depositPaidMinor >=
            quote.depositAmountMinor
          ) {
            quote.status =
              "DEPOSIT_PAID";

            quote.depositPaidAt =
              new Date();

            await BulkOrderRequestModel.updateOne(
              {
                _id:
                  quote.requestId,
              },
              {
                $set: {
                  status:
                    "DEPOSIT_PAID",
                },
              },
            );
          }

          await quote.save();
        }
      }

      await StripeWebhookEventModel.updateOne(
        {
          providerEventId:
            event.id,
        },
        {
          $set: {
            processingStatus:
              "PROCESSED",

            errorMessage:
              "",

            processedAt:
              new Date(),
          },
        },
      );

      return {
        duplicate,

        processed:
          true,
      };
    } catch (
      error: unknown
    ) {
      await StripeWebhookEventModel.updateOne(
        {
          providerEventId:
            event.id,
        },
        {
          $set: {
            processingStatus:
              "FAILED",

            errorMessage:
              error instanceof
              Error
                ? error.message
                : "Webhook processing failed.",

            processedAt:
              new Date(),
          },
        },
      );

      throw error;
    }
  }

  private async writeOrderHistory(
    session: ClientSession,
    orderId: Types.ObjectId,
    number: string,
    actor: BulkOrderAdminActor,
    initialStatus:
      | "PENDING_PAYMENT"
      | "CONFIRMED",
  ) {
    const history =
      new OrderStatusHistoryModel({
        orderId,

        orderNumber:
          number,

        fromStatus:
          null,

        toStatus:
          initialStatus,

        actorType:
          "ADMIN",

        actorId:
          new Types.ObjectId(
            actor.adminUserId,
          ),

        actorRoleNames:
          actor.roleNames,

        note:
          "Order converted from an accepted bulk/wedding/party quote and inventory was reserved.",
      });

    await history.save({
      session,
    });
  }

  async convertQuoteToOrder(
    id: string,
    input: QuoteConversionInput,
    actor: BulkOrderAdminActor,
  ) {
    const quote =
      await QuoteModel.findById(
        id,
      );

    if (!quote) {
      throw new ApiError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote was not found.",
      );
    }

    if (
      quote.convertedOrderId
    ) {
      return {
        orderId:
          quote.convertedOrderId.toString(),

        quote:
          serializeQuote(
            quote,
          ),
      };
    }

    if (
      ![
        "ACCEPTED",
        "DEPOSIT_PAID",
      ].includes(
        quote.status,
      )
    ) {
      throw new ApiError(
        409,
        "QUOTE_NOT_READY_FOR_CONVERSION",
        "Only an accepted quote with any required deposit paid can be converted.",
      );
    }

    if (
      quote.depositAmountMinor >
        0 &&
      quote.depositPaidMinor <
        quote.depositAmountMinor
    ) {
      throw new ApiError(
        409,
        "QUOTE_DEPOSIT_REQUIRED",
        "The required quote deposit must be paid before conversion.",
      );
    }

    if (
      !quote.acceptedAt
    ) {
      throw new ApiError(
        409,
        "QUOTE_NOT_ACCEPTED",
        "The customer must accept the quote before conversion.",
      );
    }

    const productLines =
      quote.lines.filter(
        (line) =>
          line.lineType ===
          "PRODUCT",
      );

    if (
      productLines.length ===
      0
    ) {
      throw new ApiError(
        409,
        "QUOTE_HAS_NO_PRODUCTS",
        "A quote must contain at least one product line before order conversion.",
      );
    }

    const store =
      await StoreLocationModel.findOne({
        _id:
          quote.storeId,

        status:
          "ACTIVE",
      }).lean();

    if (!store) {
      throw new ApiError(
        404,
        "STORE_NOT_FOUND",
        "The quote store is not available.",
      );
    }

    await validateQuoteProductsForConversion(
      quote.storeId.toString(),
      input.fulfillmentType,
      productLines,
    );

    const deliverySelection =
      input.fulfillmentType ===
      "DELIVERY"
        ? await quoteDeliverySelection({
            storeId:
              quote.storeId.toString(),

            postalCode:
              input.deliveryAddress
                ?.postalCode ??
              "",

            merchandiseMinor:
              Math.max(
                0,
                quote.subtotalMinor -
                  quote.discountMinor,
              ),

            slotId:
              input.deliverySlotId,
          })
        : null;

    const pickupSelection =
      input.fulfillmentType ===
      "PICKUP"
        ? await quotePickupSelection(
            quote.storeId.toString(),
            input.pickupSlotId,
          )
        : null;

    const selectedSlot =
      input.fulfillmentType ===
      "DELIVERY"
        ? deliverySelection?.slot
        : pickupSelection;

    if (
      !selectedSlot
    ) {
      throw new ApiError(
        409,
        "FULFILLMENT_SLOT_REQUIRED",
        "A valid fulfillment slot is required.",
      );
    }

    const allSubtotals =
      quote.lines.map(
        (line) =>
          line.lineSubtotalMinor,
      );

    const allDiscounts =
      allocate(
        quote.discountMinor,
        allSubtotals,
      );

    const allTaxes =
      allocate(
        quote.taxMinor,
        allSubtotals,
      );

    const productDiscounts:
      number[] =
      [];

    const productTaxes:
      number[] =
      [];
    const conversionCostProducts = await ProductModel.find({
      _id: { $in: productLines.map((line) => line.productId).filter(Boolean) },
    }).select({ variants: 1 }).lean();
    const conversionCostMap = new Map<string, number>();
    for (const product of conversionCostProducts) {
      for (const variant of product.variants) {
        conversionCostMap.set(
          `${product._id.toString()}:${variant._id.toString()}`,
          variant.pricing.costPriceMinor,
        );
      }
    }


    let productIndex =
      0;

    quote.lines.forEach(
      (
        line,
        index,
      ) => {
        if (
          line.lineType ===
          "PRODUCT"
        ) {
          productDiscounts[
            productIndex
          ] =
            allDiscounts[
              index
            ] ?? 0;

          productTaxes[
            productIndex
          ] =
            allTaxes[
              index
            ] ?? 0;

          productIndex +=
            1;
        }
      },
    );

    const remainingAmountMinor =
      Math.max(
        0,
        quote.totalMinor -
          quote.depositPaidMinor,
      );

    const orderId =
      new Types.ObjectId();

    const paymentId =
      new Types.ObjectId();

    const number =
      orderNumber();

    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(
        async () => {
          const current =
            await QuoteModel.findOne({
              _id:
                quote._id,

              convertedOrderId:
                null,
            }).session(
              session,
            );

          if (!current) {
            const recovered =
              await QuoteModel.findById(
                quote._id,
              ).session(
                session,
              );

            if (
              recovered?.convertedOrderId
            ) {
              return;
            }

            throw new ApiError(
              409,
              "QUOTE_ALREADY_CONVERTED",
              "This quote has already been converted.",
            );
          }

          for (
            const line of
              productLines
          ) {
            await reserveInventoryInSession(
              session,

              {
                storeId:
                  quote.storeId.toString(),

                productId:
                  line.productId?.toString() ??
                  "",

                variantId:
                  line.variantId?.toString() ??
                  "",

                quantity:
                  line.quantity,

                referenceType:
                  "ORDER",

                referenceId:
                  orderId.toString(),

                note:
                  `Reserved for quote-converted order ${number}.`,
              },

              {
                adminUserId:
                  actor.adminUserId,

                roleNames:
                  actor.roleNames,
              },
            );
          }

          if (
            input.fulfillmentType ===
            "DELIVERY"
          ) {
            const zone =
              deliverySelection?.zone;

            if (
              !zone ||
              !input.deliverySlotId
            ) {
              throw new ApiError(
                409,
                "DELIVERY_ZONE_REQUIRED",
                "A valid delivery zone is required.",
              );
            }

            await reserveDeliverySlotInSession(
              session,
              {
                slotId:
                  input.deliverySlotId,

                storeId:
                  quote.storeId.toString(),

                zoneId:
                  zone.id,
              },
            );
          } else {
            if (
              !input.pickupSlotId
            ) {
              throw new ApiError(
                409,
                "PICKUP_SLOT_REQUIRED",
                "A pickup slot is required.",
              );
            }

            await reservePickupSlotInSession(
              session,
              {
                slotId:
                  input.pickupSlotId,

                storeId:
                  quote.storeId.toString(),
              },
            );
          }

          const payment =
            await PaymentModel.create(
              [
                {
                  _id:
                    paymentId,

                  orderId,

                  customerId:
                    quote.customerId ??
                    null,

                  guestTokenHash:
                    null,

                  cartId:
                    null,

                  storeId:
                    quote.storeId,

                  provider:
                    "STRIPE",

                  checkoutFingerprint:
                    sha256(
                      `quote-order:${quote.id}:${remainingAmountMinor}`,
                    ),

                  currency:
                    quote.currency,

                  amountMinor:
                    remainingAmountMinor,

                  authorizedAmountMinor:
                    0,

                  capturedAmountMinor:
                    0,

                  refundedAmountMinor:
                    0,

                  captureMethod:
                    "AUTOMATIC",

                  status:
                    remainingAmountMinor ===
                    0
                      ? "SUCCEEDED"
                      : "PENDING",

                  customerEmail:
                    quote.contactSnapshot.email,

                  fulfillmentType:
                    input.fulfillmentType,

                  lastError:
                    null,
                },
              ],

              {
                session,
              },
            );

          if (
            !payment[0]
          ) {
            throw new Error(
              "Quote conversion failed to create a payment record.",
            );
          }

          const itemSnapshots =
            productLines.map(
              (
                line,
                index,
              ) => ({
                productId:
                  line.productId,

                variantId:
                  line.variantId,

                productNameSnapshot:
                  line.productNameSnapshot,

                productSlugSnapshot:
                  line.productSlugSnapshot,

                skuSnapshot:
                  line.skuSnapshot,

                productTypeSnapshot:
                  line.productTypeSnapshot,

                sellingUnitSnapshot:
                  line.sellingUnitSnapshot,

                unitQuantitySnapshot:
                  line.unitQuantitySnapshot,

                attributesSnapshot:
                  line.attributesSnapshot,

                imageSnapshot:
                  line.imageSnapshot,

                requestedQuantity:
                  line.quantity,

                requestedWeight:
                  line.productTypeSnapshot ===
                  "VARIABLE_WEIGHT"
                    ? line.quantity
                    : null,

                actualWeight:
                  null,

                pickedQuantity:
                  null,

                reservedQuantity:
                  line.quantity,

                fulfillmentStatus:
                  "PENDING",

                inventoryFulfillmentStatus:
                  "RESERVED",

                selectedBatch:
                  null,

                unitPriceMinor:
                  line.unitPriceMinor,

                costPriceMinorSnapshot:
                  conversionCostMap.get(
                    `${line.productId?.toString() ?? ""}:${line.variantId?.toString() ?? ""}`,
                  ) ?? null,

                lineSubtotalMinor:
                  line.lineSubtotalMinor,

                discountMinor:
                  productDiscounts[
                    index
                  ] ?? 0,

                taxMinor:
                  productTaxes[
                    index
                  ] ?? 0,

                finalLineMinor:
                  Math.max(
                    0,
                    line.lineSubtotalMinor -
                      (
                        productDiscounts[
                          index
                        ] ??
                        0
                      ) +
                      (
                        productTaxes[
                          index
                        ] ??
                        0
                      ),
                  ),

                fulfilledUnitPriceMinor:
                  line.unitPriceMinor,

                fulfilledLineSubtotalMinor:
                  line.lineSubtotalMinor,

                fulfilledDiscountMinor:
                  productDiscounts[
                    index
                  ] ?? 0,

                fulfilledTaxMinor:
                  productTaxes[
                    index
                  ] ?? 0,

                fulfilledLineMinor:
                  Math.max(
                    0,
                    line.lineSubtotalMinor -
                      (
                        productDiscounts[
                          index
                        ] ??
                        0
                      ) +
                      (
                        productTaxes[
                          index
                        ] ??
                        0
                      ),
                  ),

                substitutionPreference:
                  "CONTACT_FIRST",
              }),
            );

          const customLines =
            quote.lines
              .filter(
                (line) =>
                  line.lineType ===
                  "CUSTOM",
              )
              .map(
                (line) => ({
                  description:
                    line.description,

                  quantity:
                    line.quantity,

                  unitPriceMinor:
                    line.unitPriceMinor,

                  lineSubtotalMinor:
                    line.lineSubtotalMinor,
                }),
              );

          const createdOrders =
            await OrderModel.create(
              [
                {
                  _id:
                    orderId,

                  orderNumber:
                    number,

                  source:
                    "QUOTE",

                  customerId:
                    quote.customerId ??
                    null,

                  guestTokenHash:
                    null,

                  guestCustomer:
                    quote.customerId
                      ? null
                      : quote.contactSnapshot,

                  contactSnapshot:
                    quote.contactSnapshot,

                  storeId:
                    quote.storeId,

                  storeSnapshot: {
                    storeId:
                      quote.storeId,

                    name:
                      store.name,

                    code:
                      store.code,

                    timezone:
                      store.timezone,
                  },

                  cartId:
                    null,

                  paymentId,

                  fulfillmentType:
                    input.fulfillmentType,

                  deliveryAddress:
                    input.fulfillmentType ===
                    "DELIVERY"
                      ? input.deliveryAddress
                      : null,

                  deliveryZone:
                    input.fulfillmentType ===
                      "DELIVERY" &&
                    deliverySelection?.zone
                      ? {
                          zoneId:
                            new Types.ObjectId(
                              deliverySelection.zone.id,
                            ),

                          name:
                            deliverySelection.zone.name,

                          minimumOrderMinor:
                            deliverySelection.zone.minimumOrderMinor,

                          deliveryFeeMinor:
                            deliverySelection.zone.deliveryFeeMinor,

                          freeDeliveryThresholdMinor:
                            deliverySelection.zone.freeDeliveryThresholdMinor,
                        }
                      : null,

                  deliverySlot:
                    input.fulfillmentType ===
                    "DELIVERY"
                      ? {
                          slotId:
                            new Types.ObjectId(
                              selectedSlot.id,
                            ),

                          date:
                            selectedSlot.date,

                          startTime:
                            selectedSlot.startTime,

                          endTime:
                            selectedSlot.endTime,

                          timezone:
                            selectedSlot.timezone,
                        }
                      : null,

                  pickupSlot:
                    input.fulfillmentType ===
                    "PICKUP"
                      ? {
                          slotId:
                            new Types.ObjectId(
                              selectedSlot.id,
                            ),

                          date:
                            selectedSlot.date,

                          startTime:
                            selectedSlot.startTime,

                          endTime:
                            selectedSlot.endTime,

                          timezone:
                            selectedSlot.timezone,
                        }
                      : null,

                  fulfillmentSlotReservationStatus:
                    "ACTIVE",

                  items:
                    itemSnapshots,

                  pricing: {
                    currency:
                      quote.currency,

                    subtotalMinor:
                      quote.subtotalMinor,

                    discountMinor:
                      quote.discountMinor,

                    taxMinor:
                      quote.taxMinor,

                    deliveryFeeMinor:
                      quote.deliveryFeeMinor,

                    prepaidAmountMinor:
                      quote.depositPaidMinor,

                    totalMinor:
                      remainingAmountMinor,
                  },

                  fulfillmentPricing: {
                    currency:
                      quote.currency,

                    subtotalMinor:
                      quote.subtotalMinor,

                    discountMinor:
                      quote.discountMinor,

                    taxMinor:
                      quote.taxMinor,

                    deliveryFeeMinor:
                      quote.deliveryFeeMinor,

                    prepaidAmountMinor:
                      quote.depositPaidMinor,

                    totalMinor:
                      remainingAmountMinor,
                  },

                  quoteSnapshot: {
                    quoteId:
                      quote._id,

                    quoteNumber:
                      quote.quoteNumber,

                    requestId:
                      quote.requestId,

                    originalTotalMinor:
                      quote.totalMinor,

                    depositPaidMinor:
                      quote.depositPaidMinor,

                    customLines,
                  },

                  couponSnapshot: {
                    code:
                      "",

                    discountMinor:
                      0,
                  },

                  taxLinesSnapshot:
                    [],

                  paymentStatus:
                    remainingAmountMinor ===
                    0
                      ? "SUCCEEDED"
                      : "PENDING",

                  orderStatus:
                    remainingAmountMinor ===
                    0
                      ? "CONFIRMED"
                      : "PENDING_PAYMENT",

                  inventoryReservationStatus:
                    "ACTIVE",

                  customerNotes:
                    input.customerNotes ||
                    `Converted from quote ${quote.quoteNumber}.`,
                },
              ],

              {
                session,
              },
            );

          if (
            !createdOrders[0]
          ) {
            throw new Error(
              "Quote conversion failed to create an order record.",
            );
          }

          current.convertedOrderId =
            orderId;

          current.convertedAt =
            new Date();

          current.status =
            "CONVERTED_TO_ORDER";

          await current.save({
            session,
          });

          await BulkOrderRequestModel.updateOne(
            {
              _id:
                quote.requestId,
            },
            {
              $set: {
                status:
                  "CONVERTED_TO_ORDER",
              },
            },
            {
              session,
            },
          );

          await this.writeOrderHistory(
            session,
            orderId,
            number,
            actor,
            remainingAmountMinor ===
            0
              ? "CONFIRMED"
              : "PENDING_PAYMENT",
          );
        },
      );
    } finally {
      await session.endSession();
    }

    const updatedQuote =
      await QuoteModel.findById(
        id,
      );

    if (
      !updatedQuote?.convertedOrderId
    ) {
      throw new ApiError(
        500,
        "QUOTE_CONVERSION_FAILED",
        "Quote conversion did not create an order.",
      );
    }

    return {
      orderId:
        updatedQuote.convertedOrderId.toString(),

      quote:
        serializeQuote(
          updatedQuote,
        ),
    };
  }

  async ensureConvertedOrderPaymentIntent(
    id: string,
    token: string,
  ) {
    const quote =
      await requirePublicQuote(
        id,
        token,
      );

    if (
      !quote.convertedOrderId
    ) {
      throw new ApiError(
        409,
        "QUOTE_NOT_CONVERTED",
        "The quote has not yet been converted to an order.",
      );
    }

    const order =
      await OrderModel.findById(
        quote.convertedOrderId,
      ).lean();

    if (!order) {
      throw new ApiError(
        404,
        "ORDER_NOT_FOUND",
        "Converted order was not found.",
      );
    }

    const payment =
      await PaymentModel.findById(
        order.paymentId,
      );

    if (!payment) {
      throw new ApiError(
        404,
        "PAYMENT_NOT_FOUND",
        "Converted order payment was not found.",
      );
    }

    if (
      payment.amountMinor ===
      0
    ) {
      return {
        payment:
          paymentSummary(
            payment,
          ),

        clientSecret:
          "",
      };
    }

    if (
      payment.providerPaymentIntentId
    ) {
      try {
        const intent =
          await this.gateway.retrievePaymentIntent(
            payment.providerPaymentIntentId,
          );

        payment.status =
          stripeStatus(
            intent,
          ) ===
            "REQUIRES_ACTION" &&
          intent.status ===
            "requires_capture"
            ? "AUTHORIZED"
            : stripeStatus(
                intent,
              );

        payment.amountMinor =
          intent.amountMinor;

        payment.capturedAmountMinor =
          intent.amountReceivedMinor;

        payment.authorizedAmountMinor =
          intent.amountCapturableMinor;

        payment.lastError =
          intent.lastPaymentError;

        await payment.save();

        return {
          payment:
            paymentSummary(
              payment,
            ),

          clientSecret:
            intent.clientSecret ??
            "",
        };
      } catch (
        error: unknown
      ) {
        throw providerFailure(
          error,
        );
      }
    }

    try {
      const intent =
        await this.gateway.createPaymentIntent(
          {
            amountMinor:
              payment.amountMinor,

            currency:
              payment.currency,

            captureMethod:
              "automatic",

            customerEmail:
              payment.customerEmail,

            metadata: {
              grocery_payment_id:
                payment.id,

              grocery_order_id:
                order._id.toString(),

              grocery_quote_id:
                quote.id,

              payment_context:
                "QUOTE_ORDER_BALANCE",
            },
          },

          `grocery-quote-order-${sha256(quote.id)}`,
        );

      payment.providerPaymentIntentId =
        intent.id;

      payment.status =
        stripeStatus(
          intent,
        ) ===
          "REQUIRES_ACTION" &&
        intent.status ===
          "requires_capture"
          ? "AUTHORIZED"
          : stripeStatus(
              intent,
            );

      payment.amountMinor =
        intent.amountMinor;

      payment.capturedAmountMinor =
        intent.amountReceivedMinor;

      payment.authorizedAmountMinor =
        intent.amountCapturableMinor;

      payment.lastError =
        intent.lastPaymentError;

      await payment.save();

      return {
        payment:
          paymentSummary(
            payment,
          ),

        clientSecret:
          intent.clientSecret ??
          "",
      };
    } catch (
      error: unknown
    ) {
      throw providerFailure(
        error,
      );
    }
  }
}

export const bulkOrderService =
  new BulkOrderService();