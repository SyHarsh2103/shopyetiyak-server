import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { SUPPLIER_STATUSES } from "./supplier.model.js";

const supplierAddressSchema = z.object({
  line1: z.string().trim().max(180).optional().default(""),
  line2: z.string().trim().max(180).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  postalCode: z.string().trim().max(32).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
}).strict();

const supplierFields = z.object({
  companyName: z.string().trim().min(2, "Company name is required.").max(180),
  contactPerson: z.string().trim().max(160).optional().default(""),
  email: z.union([z.literal(""), z.email()]).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  address: supplierAddressSchema.optional().default({ line1: "", line2: "", city: "", state: "", postalCode: "", country: "" }),
  paymentTerms: z.string().trim().max(500).optional().default(""),
  taxInformation: z.string().trim().max(1000).optional().default(""),
  notes: z.string().trim().max(3000).optional().default(""),
  status: z.enum(SUPPLIER_STATUSES).optional().default("ACTIVE"),
}).strict();

export const createSupplierSchema = supplierFields;
export const updateSupplierSchema = supplierFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one supplier field must be provided." },
);

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
  status: z.enum(SUPPLIER_STATUSES).optional(),
}).strict();

const supplierProductFields = z.object({
  supplierId: objectIdSchema,
  productId: objectIdSchema,
  variantId: objectIdSchema,
  supplierSku: z.string().trim().max(100).optional().default(""),
  supplierProductName: z.string().trim().max(220).optional().default(""),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  unitCostMinor: z.number().int().nonnegative().max(1_000_000_000),
  minimumOrderQuantity: z.number().finite().positive().max(1_000_000).default(1),
  leadTimeDays: z.number().int().min(0).max(3650).default(0),
  isPreferred: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().default(""),
}).strict();

export const upsertSupplierProductSchema = supplierProductFields;

export const supplierProductListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  supplierId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  active: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(120).optional(),
}).strict();
