import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { z } from "zod";

import {
  addAddress,
  addShoppingListItem,
  addWishlistItem,
  createShoppingList,
  getAccountDashboard,
  getWishlist,
  listShoppingLists,
  updateProfile,
  validateReorder,
} from "../src/modules/customer-account/customer-account.service.js";
import { CustomerModel } from "../src/modules/customers/customer.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { StoreLocationModel } from "../src/modules/stores/store-location.model.js";

let mongo: MongoMemoryServer;
let customerId = "";
let storeId = "";
let productId = "";
let variantId = "";

const enrichedWishlistItemSchema = z.object({
  availability: z.object({
    quantityAvailable: z.number(),
  }),
  product: z
    .object({
      variant: z.object({
        pricing: z.object({
          currentPriceMinor: z.number(),
        }),
      }),
    })
    .nullable(),
});

beforeAll(async () => {
  mongo =
    await MongoMemoryServer.create();

  await mongoose.connect(
    mongo.getUri(),
  );

  const customer =
    await CustomerModel.create({
      email:
        "account@example.com",
      passwordHash:
        "test-hash",
      firstName:
        "Account",
      lastName:
        "Customer",
    });

  customerId =
    customer.id;

  const store =
    await StoreLocationModel.create(
      {
        name:
          "Downtown Store",
        code:
          "DT1",
        address: {
          line1:
            "1 Market St",
          line2:
            "",
          city:
            "Jersey City",
          state:
            "NJ",
          postalCode:
            "07302",
          country:
            "USA",
        },
        timezone:
          "America/New_York",
        pickupEnabled:
          true,
        deliveryEnabled:
          true,
        status:
          "ACTIVE",
      },
    );

  storeId =
    store.id;

  const product =
    await ProductModel.create({
      name:
        "Basmati Rice",
      slug:
        "basmati-rice",
      shortDescription:
        "Premium basmati rice",
      description:
        "Long-grain premium basmati rice.",
      categoryIds: [],
      collectionIds: [],
      productType:
        "PACKAGED",
      countryOfOrigin:
        "India",
      dietary: {
        vegetarian:
          true,
        vegan:
          true,
        glutenFree:
          true,
        halal:
          true,
        organic:
          false,
      },
      variants: [
        {
          sku:
            "RICE-5KG",
          attributes: [
            {
              name:
                "Size",
              value:
                "5 KG",
            },
          ],
          pricing: {
            currency:
              "USD",
            costPriceMinor:
              1000,
            regularPriceMinor:
              1599,
            salePriceMinor:
              1399,
          },
          sellingUnit:
            "BAG",
          unitQuantity:
            1,
          minimumQuantity:
            1,
          maximumQuantity:
            10,
          quantityIncrement:
            1,
          status:
            "ACTIVE",
        },
      ],
      isActive:
        true,
      archivedAt:
        null,
    });

  const variant =
    product.variants[0];

  if (!variant) {
    throw new Error(
      "Test variant missing.",
    );
  }

  productId =
    product.id;

  variantId =
    variant._id.toString();

  await InventoryModel.create({
    storeId:
      store._id,
    productId:
      product._id,
    variantId:
      variant._id,
    quantityOnHand:
      12,
    quantityReserved:
      2,
    quantityAvailable:
      10,
    reorderLevel:
      2,
    reorderQuantity:
      12,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe(
  "customer account service",
  () => {
    it(
      "updates profile and maintains a default address",
      async () => {
        const profile =
          await updateProfile(
            customerId,
            {
              firstName:
                "Harsh",
              lastName:
                "Panchal",
              phone:
                "+1 555 0100",
            },
          );

        expect(
          profile.phone,
        ).toBe(
          "+1 555 0100",
        );

        const address =
          await addAddress(
            customerId,
            {
              label:
                "Home",
              recipientName:
                "Harsh Panchal",
              phone:
                "+1 555 0100",
              line1:
                "1 Market Street",
              line2:
                "",
              city:
                "Jersey City",
              state:
                "NJ",
              postalCode:
                "07302",
              country:
                "USA",
              deliveryInstructions:
                "Front desk",
              isDefault:
                false,
            },
          );

        expect(
          address.isDefault,
        ).toBe(true);
      },
    );

    it(
      "saves wishlist and grocery-list items with current price and inventory",
      async () => {
        await addWishlistItem(
          customerId,
          {
            productId,
            variantId,
          },
        );

        const wishlist =
          await getWishlist(
            customerId,
            storeId,
          );

        expect(
          wishlist.items,
        ).toHaveLength(1);

        const wishlistItem =
          enrichedWishlistItemSchema.parse(
            wishlist.items[0],
          );

        expect(
          wishlistItem
            .availability
            .quantityAvailable,
        ).toBe(10);

        expect(
          wishlistItem
            .product
            ?.variant
            .pricing
            .currentPriceMinor,
        ).toBe(1399);

        const list =
          await createShoppingList(
            customerId,
            {
              name:
                "Weekly Shopping",
            },
          );

        await addShoppingListItem(
          customerId,
          list.id,
          {
            productId,
            variantId,
            quantity: 2,
          },
        );

        const lists =
          await listShoppingLists(
            customerId,
            storeId,
          );

        expect(
          lists.lists[0]
            ?.items[0]
            ?.quantity,
        ).toBe(2);
      },
    );

    it(
      "validates reorder candidates against current store inventory",
      async () => {
        const result =
          await validateReorder({
            storeId,
            items: [
              {
                productId,
                variantId,
                quantity: 3,
              },
            ],
          });

        expect(
          result.items[0]
            ?.canReorder,
        ).toBe(true);

        const unavailable =
          await validateReorder({
            storeId,
            items: [
              {
                productId,
                variantId,
                quantity: 11,
              },
            ],
          });

        expect(
          unavailable
            .items[0]
            ?.canReorder,
        ).toBe(false);

        const dashboard =
          await getAccountDashboard(
            customerId,
          );

        expect(
          dashboard.counts
            .wishlistItems,
        ).toBe(1);

        expect(
          dashboard.counts
            .shoppingLists,
        ).toBe(1);
      },
    );
  },
);