import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { AdminAccountTokenModel } from "../modules/admins/admin-account-token.model.js";
import { AdminSessionModel } from "../modules/admins/admin-session.model.js";
import { AdminUserModel } from "../modules/admins/admin-user.model.js";
import { AuditLogModel } from "../modules/audit/audit-log.model.js";
import { BulkOrderRequestModel } from "../modules/bulk-orders/bulk-order-request.model.js";
import { QuoteModel } from "../modules/bulk-orders/quote.model.js";
import { QuoteDepositPaymentModel } from "../modules/bulk-orders/quote-deposit.model.js";
import { BackInStockSubscriptionModel } from "../modules/customer-value/back-in-stock-subscription.model.js";
import { GiftCardModel } from "../modules/customer-value/gift-card.model.js";
import { GiftCardTransactionModel } from "../modules/customer-value/gift-card-transaction.model.js";
import { LoyaltyAccountModel } from "../modules/customer-value/loyalty-account.model.js";
import { LoyaltyTransactionModel } from "../modules/customer-value/loyalty-transaction.model.js";
import { StoreCreditAccountModel } from "../modules/customer-value/store-credit-account.model.js";
import { StoreCreditTransactionModel } from "../modules/customer-value/store-credit-transaction.model.js";
import { CustomerAuthTokenModel } from "../modules/auth/customer-auth-token.model.js";
import { BrandModel } from "../modules/brands/brand.model.js";
import { CategoryModel } from "../modules/categories/category.model.js";
import { CollectionModel } from "../modules/collections/collection.model.js";
import { CustomerSessionModel } from "../modules/customers/customer-session.model.js";
import { CustomerModel } from "../modules/customers/customer.model.js";
import { ShoppingListModel } from "../modules/customers/shopping-list.model.js";
import { WishlistModel } from "../modules/customers/wishlist.model.js";
import { CartModel } from "../modules/carts/cart.model.js";
import { CouponModel } from "../modules/coupons/coupon.model.js";
import { CouponRedemptionModel } from "../modules/coupons/coupon-redemption.model.js";
import { PromotionModel } from "../modules/promotions/promotion.model.js";
import { BannerModel } from "../modules/banners/banner.model.js";
import { BundleModel } from "../modules/bundles/bundle.model.js";
import { RecipeModel } from "../modules/recipes/recipe.model.js";
import { DeliverySlotModel } from "../modules/delivery/delivery-slot.model.js";
import { DeliveryZoneModel } from "../modules/delivery/delivery-zone.model.js";
import { ProductModel } from "../modules/products/product.model.js";
import { PickupSlotModel } from "../modules/pickup/pickup-slot.model.js";
import { InventoryBatchModel } from "../modules/inventory/inventory-batch.model.js";
import { InventoryModel } from "../modules/inventory/inventory.model.js";
import { InventoryTransactionModel } from "../modules/inventory/inventory-transaction.model.js";
import { StoreLocationModel } from "../modules/stores/store-location.model.js";
import { StoreProductModel } from "../modules/stores/store-product.model.js";
import { SupplierModel } from "../modules/suppliers/supplier.model.js";
import { SupplierProductModel } from "../modules/suppliers/supplier-product.model.js";
import { PurchaseOrderModel } from "../modules/purchasing/purchase-order.model.js";
import { GoodsReceiptModel } from "../modules/purchasing/goods-receipt.model.js";
import { SupplierReturnModel } from "../modules/purchasing/supplier-return.model.js";
import { PermissionModel } from "../modules/roles/permission.model.js";
import { RoleModel } from "../modules/roles/role.model.js";
import { TaxRuleModel } from "../modules/taxes/tax-rule.model.js";
import { PaymentModel } from "../modules/payments/payment.model.js";
import { PaymentAttemptModel } from "../modules/payments/payment-attempt.model.js";
import { RefundModel } from "../modules/payments/refund.model.js";
import { StripeWebhookEventModel } from "../modules/payments/stripe-webhook-event.model.js";
import { OrderModel } from "../modules/orders/order.model.js";
import { OrderStatusHistoryModel } from "../modules/orders/order-status-history.model.js";
import { OrderSubstitutionModel } from "../modules/substitutions/order-substitution.model.js";

const models = [
  CustomerModel,
  CustomerSessionModel,
  CustomerAuthTokenModel,
  WishlistModel,
  ShoppingListModel,
  CartModel,
  CouponModel,
  CouponRedemptionModel,
  PromotionModel,
  BannerModel,
  BundleModel,
  RecipeModel,
  BulkOrderRequestModel,
  QuoteModel,
  QuoteDepositPaymentModel,
  LoyaltyAccountModel,
  LoyaltyTransactionModel,
  StoreCreditAccountModel,
  StoreCreditTransactionModel,
  GiftCardModel,
  GiftCardTransactionModel,
  BackInStockSubscriptionModel,
  TaxRuleModel,
  PaymentModel,
  PaymentAttemptModel,
  RefundModel,
  StripeWebhookEventModel,
  OrderModel,
  OrderStatusHistoryModel,
  OrderSubstitutionModel,
  DeliveryZoneModel,
  DeliverySlotModel,
  PickupSlotModel,
  AdminUserModel,
  AdminSessionModel,
  AdminAccountTokenModel,
  RoleModel,
  PermissionModel,
  AuditLogModel,
  CategoryModel,
  BrandModel,
  CollectionModel,
  ProductModel,
  StoreLocationModel,
  StoreProductModel,
  InventoryModel,
  InventoryBatchModel,
  InventoryTransactionModel,
  SupplierModel,
  SupplierProductModel,
  PurchaseOrderModel,
  GoodsReceiptModel,
  SupplierReturnModel,
] as const;

async function run(): Promise<void> {
  await connectDatabase();
  for (const model of models) {
    await model.createIndexes();
    console.log(`Indexes ensured: ${model.collection.collectionName}`);
  }
  await disconnectDatabase();
}

void run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
