import { model, Schema, type InferSchemaType } from "mongoose";

export const BULK_REQUEST_TYPES = ["BULK", "WEDDING", "PARTY"] as const;
export const BULK_REQUEST_STATUSES = [
  "NEW_REQUEST",
  "CONTACTED",
  "QUOTE_PREPARATION",
  "QUOTE_SENT",
  "ACCEPTED",
  "DEPOSIT_PENDING",
  "DEPOSIT_PAID",
  "CONVERTED_TO_ORDER",
  "COMPLETED",
  "CANCELLED",
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
  },
  { _id: false },
);

const bulkOrderRequestSchema = new Schema(
  {
    requestNumber: { type: String, required: true, trim: true, uppercase: true, unique: true },
    requestType: { type: String, required: true, enum: BULK_REQUEST_TYPES, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    contact: { type: contactSchema, required: true },
    eventDate: { type: Date, required: true, index: true },
    guestCount: { type: Number, required: true, min: 1, max: 1_000_000 },
    budgetMinor: { type: Number, default: null, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
    productsRequired: { type: String, required: true, trim: true, maxlength: 5000 },
    deliveryAddress: { type: addressSchema, required: true },
    specialInstructions: { type: String, default: "", trim: true, maxlength: 5000 },
    status: { type: String, required: true, enum: BULK_REQUEST_STATUSES, default: "NEW_REQUEST", index: true },
    activeQuoteId: { type: Schema.Types.ObjectId, ref: "Quote", default: null },
    internalNotes: { type: String, default: "", trim: true, maxlength: 5000 },
  },
  { timestamps: true, versionKey: false },
);

bulkOrderRequestSchema.index({ requestType: 1, status: 1, createdAt: -1 });
bulkOrderRequestSchema.index({ "contact.email": 1, createdAt: -1 });
bulkOrderRequestSchema.index({ customerId: 1, createdAt: -1 });
bulkOrderRequestSchema.index({ createdAt: -1 });

export type BulkOrderRequest = InferSchemaType<typeof bulkOrderRequestSchema>;
export const BulkOrderRequestModel = model(
  "BulkOrderRequest",
  bulkOrderRequestSchema,
  "bulkOrderRequests",
);
