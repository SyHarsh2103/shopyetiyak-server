import { Types } from "mongoose";
import type { z } from "zod";

import { InventoryModel } from "../inventory/inventory.model.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { OrderModel } from "../orders/order.model.js";
import { CustomerModel } from "../customers/customer.model.js";
import { ShoppingListModel } from "../customers/shopping-list.model.js";
import { WishlistModel } from "../customers/wishlist.model.js";
import { ApiError } from "../../utils/api-error.js";
import type {
  addressInputSchema,
  createShoppingListSchema,
  profileUpdateSchema,
  reorderValidationSchema,
  shoppingListItemSchema,
  updateShoppingListItemSchema,
} from "./customer-account.validation.js";

type ProfileInput = z.infer<typeof profileUpdateSchema>;
type AddressInput = z.infer<typeof addressInputSchema>;
type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
type ShoppingListItemInput = z.infer<typeof shoppingListItemSchema>;
type UpdateShoppingListItemInput = z.infer<typeof updateShoppingListItemSchema>;
type ReorderValidationInput = z.infer<typeof reorderValidationSchema>;

interface ProductReference {
  productId: string;
  variantId: string;
}

function publicCustomer(customer: {
  _id: unknown;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  emailVerifiedAt?: Date | null;
}) {
  return {
    id: String(customer._id),
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone ?? "",
    emailVerified: Boolean(customer.emailVerifiedAt),
  };
}

function serializeAddress(address: {
  _id: unknown;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
}) {
  return {
    id: String(address._id),
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    deliveryInstructions: address.deliveryInstructions ?? "",
    isDefault: Boolean(address.isDefault),
  };
}

async function requireCustomer(customerId: string) {
  const customer = await CustomerModel.findOne({ _id: customerId, isActive: true });
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return customer;
}

async function assertActiveProductVariant(productId: string, variantId: string): Promise<void> {
  const exists = await ProductModel.exists({
    _id: productId,
    archivedAt: null,
    isActive: true,
    variants: { $elemMatch: { _id: variantId, status: "ACTIVE" } },
  });
  if (!exists) {
    throw new ApiError(404, "PRODUCT_VARIANT_NOT_AVAILABLE", "This product option is no longer available.");
  }
}

async function resolveStore(storeId?: string) {
  const filter: Record<string, unknown> = { status: "ACTIVE" };
  if (storeId) filter._id = new Types.ObjectId(storeId);
  const store = await StoreLocationModel.findOne(filter).sort({ name: 1, _id: 1 }).lean();
  if (storeId && !store) throw new ApiError(404, "STORE_NOT_FOUND", "The selected store is not available.");
  return store;
}

async function enrichReferences(references: ProductReference[], storeId?: string) {
  if (references.length === 0) return { store: null, items: [] as Array<Record<string, unknown>> };
  const store = await resolveStore(storeId);
  const productIds = [...new Set(references.map((item) => item.productId))].map((id) => new Types.ObjectId(id));
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const inventories = store ? await InventoryModel.find({
    storeId: store._id,
    $or: references.map((item) => ({ productId: new Types.ObjectId(item.productId), variantId: new Types.ObjectId(item.variantId) })),
  }).lean() : [];
  const inventoryMap = new Map(inventories.map((inventory) => [`${inventory.productId.toString()}:${inventory.variantId.toString()}`, inventory.quantityAvailable]));

  const storeProducts = store ? await StoreProductModel.find({
    storeId: store._id,
    productId: { $in: productIds },
  }).lean() : [];
  const storeProductMap = new Map(storeProducts.map((record) => [record.productId.toString(), record]));

  const items = references.map((reference) => {
    const product = productMap.get(reference.productId);
    const variant = product?.variants.find((entry) => entry._id.toString() === reference.variantId);
    const active = Boolean(product && product.isActive && product.archivedAt === null && variant?.status === "ACTIVE");
    const storeProduct = storeProductMap.get(reference.productId);
    const storeEnabled = !storeProduct || storeProduct.isAvailable;
    const quantityAvailable = store ? (inventoryMap.get(`${reference.productId}:${reference.variantId}`) ?? 0) : 0;
    const sale = variant?.pricing.salePriceMinor ?? null;
    const regular = variant?.pricing.regularPriceMinor ?? 0;
    const currentPriceMinor = sale !== null && sale < regular ? sale : regular;
    const primaryImage = product?.images.find((image) => image.isPrimary) ?? product?.images[0];

    return {
      productId: reference.productId,
      variantId: reference.variantId,
      product: product && variant ? {
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription,
        primaryImage: primaryImage ? { url: primaryImage.url, altText: primaryImage.altText } : null,
        variant: {
          sku: variant.sku,
          attributes: variant.attributes,
          sellingUnit: variant.sellingUnit,
          unitQuantity: variant.unitQuantity,
          minimumQuantity: variant.minimumQuantity,
          maximumQuantity: variant.maximumQuantity,
          quantityIncrement: variant.quantityIncrement,
          pricing: {
            currency: variant.pricing.currency,
            regularPriceMinor: regular,
            salePriceMinor: sale,
            currentPriceMinor,
          },
        },
      } : null,
      availability: {
        productActive: active,
        storeEnabled,
        quantityAvailable,
        inStock: active && storeEnabled && quantityAvailable > 0,
      },
    };
  });

  return {
    store: store ? { id: store._id.toString(), name: store.name, code: store.code } : null,
    items,
  };
}

export async function getAccountDashboard(customerId: string) {
  const [customer, wishlist, shoppingListCount, orderCount] = await Promise.all([
    CustomerModel.findOne({ _id: customerId, isActive: true }).lean(),
    WishlistModel.findOne({ customerId }).select({ items: 1 }).lean(),
    ShoppingListModel.countDocuments({ customerId }),
    OrderModel.countDocuments({ customerId: new Types.ObjectId(customerId) }),
  ]);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return {
    customer: publicCustomer(customer),
    counts: {
      addresses: customer.addresses.length,
      wishlistItems: wishlist?.items.length ?? 0,
      shoppingLists: shoppingListCount,
      orders: orderCount,
    },
    orderHistoryAvailable: true,
  };
}

export async function updateProfile(customerId: string, input: ProfileInput) {
  const customer = await CustomerModel.findOneAndUpdate(
    { _id: customerId, isActive: true },
    { $set: input },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return publicCustomer(customer);
}

export async function listAddresses(customerId: string) {
  const customer = await requireCustomer(customerId);
  return customer.addresses.map(serializeAddress);
}

export async function addAddress(customerId: string, input: AddressInput) {
  const customer = await requireCustomer(customerId);
  if (customer.addresses.length >= 20) throw new ApiError(409, "ADDRESS_LIMIT_REACHED", "A customer can save up to 20 addresses.");
  const makeDefault = input.isDefault || customer.addresses.length === 0;
  if (makeDefault) customer.addresses.forEach((address) => { address.isDefault = false; });
  customer.addresses.push({
    _id: new Types.ObjectId(),
    ...input,
    isDefault: makeDefault,
  });
  await customer.save();
  const created = customer.addresses[customer.addresses.length - 1];
  if (!created) throw new Error("Address was not created.");
  return serializeAddress(created);
}

export async function updateAddress(customerId: string, addressId: string, input: AddressInput) {
  const customer = await requireCustomer(customerId);
  const address = customer.addresses.find((entry) => entry._id.toString() === addressId);
  if (!address) throw new ApiError(404, "ADDRESS_NOT_FOUND", "Address not found.");
  if (input.isDefault) customer.addresses.forEach((entry) => { entry.isDefault = false; });
  address.label = input.label;
  address.recipientName = input.recipientName;
  address.phone = input.phone;
  address.line1 = input.line1;
  address.line2 = input.line2;
  address.city = input.city;
  address.state = input.state;
  address.postalCode = input.postalCode;
  address.country = input.country;
  address.deliveryInstructions = input.deliveryInstructions;
  const anotherDefault = customer.addresses.some((entry) => entry._id.toString() !== addressId && entry.isDefault);
  address.isDefault = input.isDefault || customer.addresses.length === 1 || (!anotherDefault && Boolean(address.isDefault));
  await customer.save();
  return serializeAddress(address);
}

export async function removeAddress(customerId: string, addressId: string): Promise<void> {
  const customer = await requireCustomer(customerId);
  const index = customer.addresses.findIndex((entry) => entry._id.toString() === addressId);
  if (index < 0) throw new ApiError(404, "ADDRESS_NOT_FOUND", "Address not found.");
  const wasDefault = Boolean(customer.addresses[index]?.isDefault);
  customer.addresses.splice(index, 1);
  if (wasDefault && customer.addresses[0]) customer.addresses[0].isDefault = true;
  await customer.save();
}

export async function getWishlist(customerId: string, storeId?: string) {
  const wishlist = await WishlistModel.findOne({ customerId }).lean();
  const references = (wishlist?.items ?? []).map((item) => ({ productId: item.productId.toString(), variantId: item.variantId.toString() }));
  const enriched = await enrichReferences(references, storeId);
  const addedAtMap = new Map((wishlist?.items ?? []).map((item) => [`${item.productId.toString()}:${item.variantId.toString()}`, item.addedAt]));
  return {
    store: enriched.store,
    items: enriched.items.map((item) => ({ ...item, addedAt: addedAtMap.get(`${String(item.productId)}:${String(item.variantId)}`) ?? null })),
  };
}

export async function addWishlistItem(customerId: string, input: ProductReference): Promise<void> {
  await assertActiveProductVariant(input.productId, input.variantId);
  const wishlist = await WishlistModel.findOneAndUpdate(
    { customerId },
    { $setOnInsert: { customerId } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  if (!wishlist) throw new Error("Wishlist was not created.");
  const duplicate = wishlist.items.some((item) => item.productId.toString() === input.productId && item.variantId.toString() === input.variantId);
  if (duplicate) return;
  if (wishlist.items.length >= 250) throw new ApiError(409, "WISHLIST_LIMIT_REACHED", "A wishlist can contain up to 250 items.");
  wishlist.items.push({ productId: new Types.ObjectId(input.productId), variantId: new Types.ObjectId(input.variantId), addedAt: new Date() });
  await wishlist.save();
}

export async function removeWishlistItem(customerId: string, productId: string, variantId: string): Promise<void> {
  await WishlistModel.updateOne(
    { customerId },
    { $pull: { items: { productId: new Types.ObjectId(productId), variantId: new Types.ObjectId(variantId) } } },
  );
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

export async function listShoppingLists(customerId: string, storeId?: string) {
  const lists = await ShoppingListModel.find({ customerId }).sort({ updatedAt: -1, name: 1 }).lean();
  const references = lists.flatMap((list) => list.items.map((item) => ({ productId: item.productId.toString(), variantId: item.variantId.toString() })));
  const enriched = await enrichReferences(references, storeId);
  const enrichmentMap = new Map(enriched.items.map((item) => [`${String(item.productId)}:${String(item.variantId)}`, item]));
  return {
    store: enriched.store,
    lists: lists.map((list) => ({
      id: list._id.toString(),
      name: list.name,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      items: list.items.map((item) => ({
        quantity: item.quantity,
        addedAt: item.addedAt,
        ...(enrichmentMap.get(`${item.productId.toString()}:${item.variantId.toString()}`) ?? { productId: item.productId.toString(), variantId: item.variantId.toString(), product: null, availability: { productActive: false, storeEnabled: false, quantityAvailable: 0, inStock: false } }),
      })),
    })),
  };
}

export async function createShoppingList(customerId: string, input: CreateShoppingListInput) {
  const count = await ShoppingListModel.countDocuments({ customerId });
  if (count >= 50) throw new ApiError(409, "SHOPPING_LIST_LIMIT_REACHED", "A customer can create up to 50 shopping lists.");
  try {
    const list = await ShoppingListModel.create({ customerId: new Types.ObjectId(customerId), name: input.name, nameKey: nameKey(input.name), items: [] });
    return { id: list.id, name: list.name, items: [] };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      throw new ApiError(409, "SHOPPING_LIST_NAME_EXISTS", "A shopping list with this name already exists.");
    }
    throw error;
  }
}

export async function renameShoppingList(customerId: string, listId: string, input: CreateShoppingListInput) {
  try {
    const list = await ShoppingListModel.findOneAndUpdate(
      { _id: listId, customerId },
      { $set: { name: input.name, nameKey: nameKey(input.name) } },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!list) throw new ApiError(404, "SHOPPING_LIST_NOT_FOUND", "Shopping list not found.");
    return { id: list._id.toString(), name: list.name };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      throw new ApiError(409, "SHOPPING_LIST_NAME_EXISTS", "A shopping list with this name already exists.");
    }
    throw error;
  }
}

export async function deleteShoppingList(customerId: string, listId: string): Promise<void> {
  const result = await ShoppingListModel.deleteOne({ _id: listId, customerId });
  if (result.deletedCount === 0) throw new ApiError(404, "SHOPPING_LIST_NOT_FOUND", "Shopping list not found.");
}

export async function addShoppingListItem(customerId: string, listId: string, input: ShoppingListItemInput): Promise<void> {
  await assertActiveProductVariant(input.productId, input.variantId);
  const list = await ShoppingListModel.findOne({ _id: listId, customerId });
  if (!list) throw new ApiError(404, "SHOPPING_LIST_NOT_FOUND", "Shopping list not found.");
  const existing = list.items.find((item) => item.productId.toString() === input.productId && item.variantId.toString() === input.variantId);
  if (existing) existing.quantity = input.quantity;
  else {
    if (list.items.length >= 250) throw new ApiError(409, "SHOPPING_LIST_ITEM_LIMIT_REACHED", "A shopping list can contain up to 250 items.");
    list.items.push({ productId: new Types.ObjectId(input.productId), variantId: new Types.ObjectId(input.variantId), quantity: input.quantity, addedAt: new Date() });
  }
  await list.save();
}

export async function updateShoppingListItem(customerId: string, listId: string, productId: string, variantId: string, input: UpdateShoppingListItemInput): Promise<void> {
  const list = await ShoppingListModel.findOne({ _id: listId, customerId });
  if (!list) throw new ApiError(404, "SHOPPING_LIST_NOT_FOUND", "Shopping list not found.");
  const item = list.items.find((entry) => entry.productId.toString() === productId && entry.variantId.toString() === variantId);
  if (!item) throw new ApiError(404, "SHOPPING_LIST_ITEM_NOT_FOUND", "Shopping list item not found.");
  item.quantity = input.quantity;
  await list.save();
}

export async function removeShoppingListItem(customerId: string, listId: string, productId: string, variantId: string): Promise<void> {
  const result = await ShoppingListModel.updateOne(
    { _id: listId, customerId },
    { $pull: { items: { productId: new Types.ObjectId(productId), variantId: new Types.ObjectId(variantId) } } },
  );
  if (result.matchedCount === 0) throw new ApiError(404, "SHOPPING_LIST_NOT_FOUND", "Shopping list not found.");
}

export async function validateReorder(input: ReorderValidationInput) {
  const enriched = await enrichReferences(input.items.map((item) => ({ productId: item.productId, variantId: item.variantId })), input.storeId);
  const quantities = new Map(input.items.map((item) => [`${item.productId}:${item.variantId}`, item.quantity]));
  return {
    store: enriched.store,
    items: enriched.items.map((item) => {
      const requestedQuantity = quantities.get(`${String(item.productId)}:${String(item.variantId)}`) ?? 0;
      const availability = item.availability as { productActive: boolean; storeEnabled: boolean; quantityAvailable: number; inStock: boolean };
      return {
        ...item,
        requestedQuantity,
        canReorder: Boolean(item.product) && availability.productActive && availability.storeEnabled && availability.quantityAvailable >= requestedQuantity,
      };
    }),
  };
}
