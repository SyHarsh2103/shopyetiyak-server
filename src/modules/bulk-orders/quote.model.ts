import { model, Schema, type InferSchemaType } from "mongoose";

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "DEPOSIT_PENDING",
  "DEPOSIT_PAID",
  "CONVERTED_TO_ORDER",
  "CANCELLED",
  "EXPIRED",
] as const;

export const QUOTE_LINE_TYPES = ["PRODUCT", "CUSTOM"] as const;
export const QUOTE_DEPOSIT_MODES = ["NONE", "FIXED", "PERCENTAGE"] as const;

const contactSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false },
);

const quoteLineSchema = new Schema(
  {
    lineType: { type: String, required: true, enum: QUOTE_LINE_TYPES },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantId: { type: Schema.Types.ObjectId, default: null },
    productNameSnapshot: { type: String, default: "", trim: true, maxlength: 240 },
    productSlugSnapshot: { type: String, default: "", trim: true, maxlength: 260 },
    skuSnapshot: { type: String, default: "", trim: true, maxlength: 120 },
    productTypeSnapshot: { type: String, default: "", trim: true, maxlength: 40 },
    sellingUnitSnapshot: { type: String, default: "", trim: true, maxlength: 40 },
    unitQuantitySnapshot: { type: Number, default: 1, min: 0 },
    attributesSnapshot: {
      type: [{ name: { type: String, required: true }, value: { type: String, required: true } }],
      default: [],
      _id: false,
    },
    imageSnapshot: {
      type: new Schema(
        {
          url: { type: String, required: true, trim: true, maxlength: 1000 },
          altText: { type: String, default: "", trim: true, maxlength: 300 },
        },
        { _id: false },
      ),
      default: null,
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0.001, max: 1_000_000 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    lineSubtotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const quoteSchema = new Schema(
  {
    quoteNumber: { type: String, required: true, trim: true, uppercase: true, unique: true },
    requestId: { type: Schema.Types.ObjectId, ref: "BulkOrderRequest", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    contactSnapshot: { type: contactSchema, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
    lines: { type: [quoteLineSchema], required: true, validate: [(lines: unknown[]) => lines.length > 0, "Quote requires at least one line."] },
    subtotalMinor: { type: Number, required: true, min: 0 },
    discountMinor: { type: Number, required: true, min: 0, default: 0 },
    taxMinor: { type: Number, required: true, min: 0, default: 0 },
    deliveryFeeMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    depositMode: { type: String, required: true, enum: QUOTE_DEPOSIT_MODES, default: "NONE" },
    depositFixedMinor: { type: Number, default: null, min: 0 },
    depositPercentBasisPoints: { type: Number, default: null, min: 0, max: 10_000 },
    depositAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    depositPaidMinor: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: QUOTE_STATUSES, default: "DRAFT", index: true },
    validUntil: { type: Date, required: true, index: true },
    customerMessage: { type: String, default: "", trim: true, maxlength: 5000 },
    internalNotes: { type: String, default: "", trim: true, maxlength: 5000 },
    accessTokenHash: { type: String, default: null, select: false },
    accessTokenLastFour: { type: String, default: "", maxlength: 4 },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    depositPaidAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    convertedOrderId: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

quoteSchema.index({ requestId: 1, createdAt: -1 });
quoteSchema.index({ status: 1, validUntil: 1 });
quoteSchema.index({ storeId: 1, createdAt: -1 });
quoteSchema.index({ customerId: 1, createdAt: -1 });
quoteSchema.index({ createdAt: -1 });

export type Quote = InferSchemaType<typeof quoteSchema>;
export const QuoteModel = model("Quote", quoteSchema, "quotes");
