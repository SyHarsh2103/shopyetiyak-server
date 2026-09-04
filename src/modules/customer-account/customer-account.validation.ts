import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "A valid MongoDB id is required.");
const phone = z.string().trim().max(40);

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone,
}).strict();

export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  recipientName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  line1: z.string().trim().min(1).max(180),
  line2: z.string().trim().max(180).default(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(1).max(120),
  deliveryInstructions: z.string().trim().max(500).default(""),
  isDefault: z.boolean().default(false),
}).strict();

export const addressParamsSchema = z.object({ addressId: objectId }).strict();

export const accountStoreQuerySchema = z.object({ storeId: objectId.optional() }).strict();

export const wishlistItemSchema = z.object({
  productId: objectId,
  variantId: objectId,
}).strict();

export const wishlistItemParamsSchema = z.object({
  productId: objectId,
  variantId: objectId,
}).strict();

export const createShoppingListSchema = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

export const updateShoppingListSchema = createShoppingListSchema;
export const shoppingListParamsSchema = z.object({ listId: objectId }).strict();

export const shoppingListItemSchema = z.object({
  productId: objectId,
  variantId: objectId,
  quantity: z.coerce.number().finite().min(0.001).max(100000),
}).strict();

export const shoppingListItemParamsSchema = z.object({
  listId: objectId,
  productId: objectId,
  variantId: objectId,
}).strict();

export const updateShoppingListItemSchema = z.object({
  quantity: z.coerce.number().finite().min(0.001).max(100000),
}).strict();

export const reorderValidationSchema = z.object({
  storeId: objectId.optional(),
  items: z.array(z.object({
    productId: objectId,
    variantId: objectId,
    quantity: z.coerce.number().finite().min(0.001).max(100000),
  }).strict()).min(1).max(100),
}).strict();
