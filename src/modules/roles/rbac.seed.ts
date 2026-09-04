import { PermissionModel } from "./permission.model.js";
import { RoleModel } from "./role.model.js";

export const SYSTEM_PERMISSIONS = [
  ["staff.manage", "Manage staff accounts."],
  ["roles.manage", "Manage roles."],
  ["permissions.manage", "Manage permission assignments."],
  ["audit.read", "Read audit logs."],
  ["settings.manage", "Manage application settings."],
  ["catalog.read", "Read catalog records."],
  ["categories.create", "Create categories."],
  ["categories.update", "Update categories."],
  ["categories.delete", "Delete unused categories."],
  ["brands.create", "Create brands."],
  ["brands.update", "Update brands."],
  ["brands.delete", "Delete unused brands."],
  ["collections.create", "Create collections."],
  ["collections.update", "Update collections."],
  ["collections.delete", "Delete unused collections."],
  ["products.create", "Create products."],
  ["products.update", "Update products."],
  ["products.archive", "Archive products."],
  ["product-images.upload", "Upload product images."],
  ["product-images.delete", "Delete unattached product images."],
  ["stores.read", "Read store locations."],
  ["stores.create", "Create store locations."],
  ["stores.update", "Update store locations."],
  ["store-products.read", "Read store product availability."],
  ["store-products.manage", "Manage store product availability."],
  ["inventory.read", "Read inventory balances."],
  ["inventory.adjust", "Adjust inventory and reorder policies."],
  ["inventory.reserve", "Reserve, release, and commit inventory."],
  ["inventory.transfer", "Transfer inventory between stores."],
  ["inventory-batches.read", "Read inventory batches and expiry."],
  ["inventory-batches.receive", "Receive inventory into tracked batches."],
  ["inventory-transactions.read", "Read inventory transaction history."],
  ["suppliers.read", "Read suppliers."],
  ["suppliers.create", "Create suppliers."],
  ["suppliers.update", "Update suppliers."],
  ["supplier-products.read", "Read supplier product mappings."],
  ["supplier-products.manage", "Manage supplier product mappings and costs."],
  ["purchase-orders.read", "Read purchase orders."],
  ["purchase-orders.create", "Create purchase orders."],
  ["purchase-orders.update", "Update draft purchase orders."],
  ["purchase-orders.status", "Approve, send, cancel, and close purchase orders."],
  ["goods-receipts.read", "Read goods receipts."],
  ["goods-receipts.create", "Receive purchase order goods into inventory."],
  ["supplier-returns.read", "Read supplier returns."],
  ["supplier-returns.create", "Return supplier stock and reduce inventory."],
  ["payments.read", "Read payment records."],
  ["payments.capture", "Capture authorized Stripe payments."],
  ["payments.cancel", "Cancel uncaptured Stripe payments."],
  ["payments.refund", "Create Stripe refunds."],
  ["orders.read", "Read customer orders."],
  ["orders.update", "Update order processing status."],
  ["orders.cancel", "Cancel eligible orders."],
  ["fulfillment.picking.read", "Read orders in the picker workflow."],
  ["fulfillment.picking.manage", "Start picking, record actual quantities, substitutions, and unavailable items."],
  ["fulfillment.packing.read", "Read orders awaiting packing."],
  ["fulfillment.packing.manage", "Complete packing, settle payment adjustments, and commit reserved inventory."],
  ["delivery.read", "Read delivery zones, slots, and delivery orders."],
  ["delivery.manage", "Manage delivery zones/slots and delivery order handoff/status."],
  ["pickup.read", "Read pickup slots and pickup orders."],
  ["pickup.manage", "Manage pickup slots and complete customer pickup."],
  ["marketing.read", "Read promotions, coupons, banners, bundles, and merchandising."],
  ["marketing.manage", "Manage promotions, coupons, banners, bundles, and merchandising."],
  ["content.read", "Read recipes and meal-kit content."],
  ["content.manage", "Manage recipes, ingredient mappings, and meal-kit content."],
  ["bulk-orders.read", "Read bulk, wedding, and party inquiries."],
  ["bulk-orders.manage", "Manage bulk, wedding, and party inquiry lifecycle."],
  ["quotes.read", "Read quotations and quote payment status."],
  ["quotes.manage", "Create, edit, and send quotations."],
  ["quotes.convert", "Convert accepted quotations into normal orders."],
  ["customer-value.read", "Read customer loyalty and store-credit balances."],
  ["loyalty.manage", "Adjust customer loyalty points."],
  ["store-credit.manage", "Adjust customer store credit."],
  ["gift-cards.read", "Read gift cards and balances."],
  ["gift-cards.manage", "Issue, adjust, enable, and disable gift cards."],
  ["back-in-stock.read", "Read back-in-stock subscriptions."],
  ["back-in-stock.manage", "Dispatch and manage back-in-stock alerts."],
  ["reports.read", "Read operational and financial reports."],
  ["reports.export", "Export reports as CSV, Excel, and PDF."],
] as const;

export const SYSTEM_ROLE_NAMES = [
  "SUPER_ADMIN", "ADMIN", "STORE_MANAGER", "ORDER_MANAGER", "INVENTORY_MANAGER", "PICKER", "PACKER",
  "CASHIER", "DELIVERY_DRIVER", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF", "CUSTOMER_SUPPORT",
  "MARKETING_MANAGER", "FINANCE", "CUSTOMER",
] as const;

export async function seedSystemRbac(): Promise<void> {
  for (const [key, description] of SYSTEM_PERMISSIONS) {
    await PermissionModel.updateOne({ key }, { $set: { description, isSystem: true } }, { upsert: true });
  }

  const allPermissionKeys = SYSTEM_PERMISSIONS.map(([key]) => key);
  for (const name of SYSTEM_ROLE_NAMES) {
    const description = `${name.replaceAll("_", " ")} role`;
    if (name === "SUPER_ADMIN") {
      await RoleModel.updateOne(
        { name },
        { $set: { name, description, permissionKeys: allPermissionKeys, isSystem: true } },
        { upsert: true },
      );
      continue;
    }
    await RoleModel.updateOne(
      { name },
      { $set: { description, isSystem: true }, $setOnInsert: { name, permissionKeys: [] } },
      { upsert: true },
    );
  }

  const fulfillmentDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    {
      name: "ADMIN",
      permissionKeys: [
        "fulfillment.picking.read",
        "fulfillment.picking.manage",
        "fulfillment.packing.read",
        "fulfillment.packing.manage",
        "delivery.read",
        "delivery.manage",
        "pickup.read",
        "pickup.manage",
      ],
    },
    {
      name: "STORE_MANAGER",
      permissionKeys: [
        "fulfillment.picking.read",
        "fulfillment.picking.manage",
        "fulfillment.packing.read",
        "fulfillment.packing.manage",
        "delivery.read",
        "delivery.manage",
        "pickup.read",
        "pickup.manage",
      ],
    },
    {
      name: "ORDER_MANAGER",
      permissionKeys: [
        "fulfillment.picking.read",
        "fulfillment.picking.manage",
        "fulfillment.packing.read",
        "fulfillment.packing.manage",
        "delivery.read",
        "delivery.manage",
        "pickup.read",
        "pickup.manage",
      ],
    },
    {
      name: "PICKER",
      permissionKeys: [
        "fulfillment.picking.read",
        "fulfillment.picking.manage",
      ],
    },
    {
      name: "PACKER",
      permissionKeys: [
        "fulfillment.packing.read",
        "fulfillment.packing.manage",
      ],
    },
    {
      name: "DELIVERY_DRIVER",
      permissionKeys: [
        "delivery.read",
        "delivery.manage",
      ],
    },
    {
      name: "CASHIER",
      permissionKeys: [
        "pickup.read",
        "pickup.manage",
      ],
    },
  ];

  for (const defaults of fulfillmentDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }
  const marketingDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    { name: "ADMIN", permissionKeys: ["marketing.read", "marketing.manage"] },
    { name: "STORE_MANAGER", permissionKeys: ["marketing.read"] },
    { name: "MARKETING_MANAGER", permissionKeys: ["marketing.read", "marketing.manage"] },
  ];

  for (const defaults of marketingDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }

  const contentDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    { name: "ADMIN", permissionKeys: ["content.read", "content.manage"] },
    { name: "STORE_MANAGER", permissionKeys: ["content.read"] },
    { name: "MARKETING_MANAGER", permissionKeys: ["content.read", "content.manage"] },
  ];

  for (const defaults of contentDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }

  const bulkOrderDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    { name: "ADMIN", permissionKeys: ["bulk-orders.read", "bulk-orders.manage", "quotes.read", "quotes.manage", "quotes.convert"] },
    { name: "STORE_MANAGER", permissionKeys: ["bulk-orders.read", "bulk-orders.manage", "quotes.read", "quotes.manage", "quotes.convert"] },
    { name: "ORDER_MANAGER", permissionKeys: ["bulk-orders.read", "bulk-orders.manage", "quotes.read", "quotes.manage", "quotes.convert"] },
    { name: "CUSTOMER_SUPPORT", permissionKeys: ["bulk-orders.read", "bulk-orders.manage", "quotes.read"] },
    { name: "FINANCE", permissionKeys: ["quotes.read"] },
  ];

  for (const defaults of bulkOrderDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }

  const customerValueDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    { name: "ADMIN", permissionKeys: ["customer-value.read", "loyalty.manage", "store-credit.manage", "gift-cards.read", "gift-cards.manage", "back-in-stock.read", "back-in-stock.manage"] },
    { name: "STORE_MANAGER", permissionKeys: ["customer-value.read", "loyalty.manage", "store-credit.manage", "gift-cards.read", "gift-cards.manage", "back-in-stock.read", "back-in-stock.manage"] },
    { name: "CUSTOMER_SUPPORT", permissionKeys: ["customer-value.read", "loyalty.manage", "store-credit.manage", "gift-cards.read", "back-in-stock.read"] },
    { name: "MARKETING_MANAGER", permissionKeys: ["back-in-stock.read", "back-in-stock.manage"] },
    { name: "FINANCE", permissionKeys: ["customer-value.read", "store-credit.manage", "gift-cards.read", "gift-cards.manage"] },
  ];

  for (const defaults of customerValueDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }

  const reportingDefaults: ReadonlyArray<{ name: string; permissionKeys: string[] }> = [
    { name: "ADMIN", permissionKeys: ["reports.read", "reports.export"] },
    { name: "STORE_MANAGER", permissionKeys: ["reports.read", "reports.export"] },
    { name: "ORDER_MANAGER", permissionKeys: ["reports.read"] },
    { name: "INVENTORY_MANAGER", permissionKeys: ["reports.read", "reports.export"] },
    { name: "WAREHOUSE_MANAGER", permissionKeys: ["reports.read", "reports.export"] },
    { name: "FINANCE", permissionKeys: ["reports.read", "reports.export"] },
  ];

  for (const defaults of reportingDefaults) {
    await RoleModel.updateOne(
      { name: defaults.name },
      { $addToSet: { permissionKeys: { $each: defaults.permissionKeys } } },
    );
  }

}
