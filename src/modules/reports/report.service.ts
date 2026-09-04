import { Types, type PipelineStage } from "mongoose";

import { CustomerModel } from "../customers/customer.model.js";
import { InventoryBatchModel } from "../inventory/inventory-batch.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { InventoryTransactionModel } from "../inventory/inventory-transaction.model.js";
import { OrderModel } from "../orders/order.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { RefundModel } from "../payments/refund.model.js";
import { GoodsReceiptModel } from "../purchasing/goods-receipt.model.js";
import { PurchaseOrderModel } from "../purchasing/purchase-order.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import type { ReportQueryInput } from "./report.validation.js";
import type { ExportTable } from "./report.export.js";

export interface NormalizedReportFilters {
  from: Date;
  toExclusive: Date;
  fromDate: string;
  toDate: string;
  storeId?: string;
  currency?: string;
}

const PAID_STATUSES = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"];
const INVALID_ORDER_STATUSES = ["CANCELLED", "PAYMENT_FAILED"];
const WASTE_TYPES = ["DAMAGED", "EXPIRED", "SPOILED", "LOST", "THEFT"];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normalizeReportFilters(input: ReportQueryInput): NormalizedReportFilters {
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fromDate = input.from ?? isoDate(defaultFrom);
  const toDate = input.to ?? isoDate(defaultTo);
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const toInclusive = new Date(`${toDate}T00:00:00.000Z`);
  const toExclusive = new Date(toInclusive);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive, fromDate, toDate, storeId: input.storeId, currency: input.currency };
}

function storeObjectId(filters: NormalizedReportFilters): Types.ObjectId | undefined {
  return filters.storeId ? new Types.ObjectId(filters.storeId) : undefined;
}

function orderMatch(filters: NormalizedReportFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {
    createdAt: { $gte: filters.from, $lt: filters.toExclusive },
    paymentStatus: { $in: PAID_STATUSES },
    orderStatus: { $nin: INVALID_ORDER_STATUSES },
  };
  const storeId = storeObjectId(filters);
  if (storeId) match.storeId = storeId;
  if (filters.currency) match["pricing.currency"] = filters.currency;
  return match;
}

function dateMatch(filters: NormalizedReportFilters, field = "createdAt"): Record<string, unknown> {
  return { [field]: { $gte: filters.from, $lt: filters.toExclusive } };
}

function fulfilledGrossExpression(): Record<string, unknown> {
  return {
    $add: [
      { $ifNull: ["$fulfillmentPricing.totalMinor", "$pricing.totalMinor"] },
      { $ifNull: ["$fulfillmentPricing.prepaidAmountMinor", "$pricing.prepaidAmountMinor"] },
    ],
  };
}

function itemRevenueExpression(): Record<string, unknown> {
  return { $ifNull: ["$items.fulfilledLineMinor", "$items.finalLineMinor"] };
}

function itemQuantityExpression(): Record<string, unknown> {
  return {
    $cond: [
      { $eq: ["$items.productTypeSnapshot", "VARIABLE_WEIGHT"] },
      { $ifNull: ["$items.actualWeight", "$items.requestedQuantity"] },
      { $ifNull: ["$items.pickedQuantity", "$items.requestedQuantity"] },
    ],
  };
}

export async function getSalesReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match = orderMatch(filters);
  const [summaryRows, byDay, byStore, byFulfillment, topProducts, byCategory] = await Promise.all([
    OrderModel.aggregate<{
      orders: number; grossSalesMinor: number; netRevenueMinor: number; discountsMinor: number; taxMinor: number;
      deliveryFeeMinor: number; customerValueMinor: number;
    }>([
      { $match: match },
      { $lookup: { from: "payments", localField: "paymentId", foreignField: "_id", as: "payment" } },
      { $set: { payment: { $first: "$payment" }, grossMinor: fulfilledGrossExpression() } },
      { $set: {
        restoredCustomerValueMinor: { $cond: [{ $ne: [{ $ifNull: ["$customerValueSnapshot.redemptionsReversedAt", null] }, null] }, { $ifNull: ["$customerValueSnapshot.totalMinor", 0] }, 0] },
        stripeRefundMinor: { $ifNull: ["$payment.refundedAmountMinor", 0] },
      } },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        grossSalesMinor: { $sum: "$grossMinor" },
        netRevenueMinor: { $sum: { $max: [0, { $subtract: ["$grossMinor", { $add: ["$stripeRefundMinor", "$restoredCustomerValueMinor"] }] }] } },
        discountsMinor: { $sum: { $ifNull: ["$fulfillmentPricing.discountMinor", "$pricing.discountMinor"] } },
        taxMinor: { $sum: { $ifNull: ["$fulfillmentPricing.taxMinor", "$pricing.taxMinor"] } },
        deliveryFeeMinor: { $sum: { $ifNull: ["$fulfillmentPricing.deliveryFeeMinor", "$pricing.deliveryFeeMinor"] } },
        customerValueMinor: { $sum: { $ifNull: ["$fulfillmentPricing.prepaidAmountMinor", "$pricing.prepaidAmountMinor"] } },
      } },
    ]),
    OrderModel.aggregate<{ date: string; orders: number; grossSalesMinor: number }>([
      { $match: match },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, orders: { $sum: 1 }, grossSalesMinor: { $sum: fulfilledGrossExpression() } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", orders: 1, grossSalesMinor: 1 } },
    ]),
    OrderModel.aggregate<{ storeId: string; storeName: string; orders: number; grossSalesMinor: number }>([
      { $match: match },
      { $group: { _id: "$storeId", storeName: { $first: "$storeSnapshot.name" }, orders: { $sum: 1 }, grossSalesMinor: { $sum: fulfilledGrossExpression() } } },
      { $sort: { grossSalesMinor: -1 } },
      { $project: { _id: 0, storeId: { $toString: "$_id" }, storeName: 1, orders: 1, grossSalesMinor: 1 } },
    ]),
    OrderModel.aggregate<{ fulfillmentType: string; orders: number; grossSalesMinor: number }>([
      { $match: match },
      { $group: { _id: "$fulfillmentType", orders: { $sum: 1 }, grossSalesMinor: { $sum: fulfilledGrossExpression() } } },
      { $project: { _id: 0, fulfillmentType: "$_id", orders: 1, grossSalesMinor: 1 } },
    ]),
    OrderModel.aggregate<{ productId: string; productName: string; sku: string; quantity: number; grossSalesMinor: number }>([
      { $match: match },
      { $unwind: "$items" },
      { $match: { "items.fulfillmentStatus": { $ne: "UNAVAILABLE" } } },
      { $group: {
        _id: { productId: "$items.productId", variantId: "$items.variantId", sku: "$items.skuSnapshot", name: "$items.productNameSnapshot" },
        quantity: { $sum: itemQuantityExpression() }, grossSalesMinor: { $sum: itemRevenueExpression() },
      } },
      { $sort: { grossSalesMinor: -1 } }, { $limit: 25 },
      { $project: { _id: 0, productId: { $toString: "$_id.productId" }, productName: "$_id.name", sku: "$_id.sku", quantity: 1, grossSalesMinor: 1 } },
    ]),
    OrderModel.aggregate<{ categoryId: string | null; categoryName: string; quantity: number; grossSalesMinor: number }>([
      { $match: match },
      { $unwind: "$items" },
      { $match: { "items.fulfillmentStatus": { $ne: "UNAVAILABLE" } } },
      { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
      { $set: { product: { $first: "$product" } } },
      { $set: { primaryCategoryId: { $arrayElemAt: [{ $ifNull: ["$product.categoryIds", []] }, 0] } } },
      { $lookup: { from: "categories", localField: "primaryCategoryId", foreignField: "_id", as: "category" } },
      { $set: { category: { $first: "$category" } } },
      { $group: { _id: "$primaryCategoryId", categoryName: { $first: { $ifNull: ["$category.name", "Uncategorized"] } }, quantity: { $sum: itemQuantityExpression() }, grossSalesMinor: { $sum: itemRevenueExpression() } } },
      { $sort: { grossSalesMinor: -1 } },
      { $project: { _id: 0, categoryId: { $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null] }, categoryName: 1, quantity: 1, grossSalesMinor: 1 } },
    ]),
  ]);
  const summary = summaryRows[0] ?? { orders: 0, grossSalesMinor: 0, netRevenueMinor: 0, discountsMinor: 0, taxMinor: 0, deliveryFeeMinor: 0, customerValueMinor: 0 };
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { ...summary, averageOrderValueMinor: summary.orders > 0 ? Math.round(summary.netRevenueMinor / summary.orders) : 0 }, byDay, byStore, byFulfillment, topProducts, byCategory };
}

export async function getProfitabilityReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match = orderMatch(filters);
  const rows = await OrderModel.aggregate<{
    productId: string; productName: string; sku: string; revenueMinor: number; cogsMinor: number; grossProfitMinor: number; quantity: number; snapshotCostLines: number; fallbackCostLines: number;
  }>([
    { $match: match },
    { $unwind: "$items" },
    { $match: { "items.fulfillmentStatus": { $ne: "UNAVAILABLE" } } },
    { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
    { $set: { product: { $first: "$product" } } },
    { $set: {
      currentVariant: { $first: { $filter: { input: { $ifNull: ["$product.variants", []] }, as: "variant", cond: { $eq: ["$$variant._id", "$items.variantId"] } } } },
      quantityForCost: itemQuantityExpression(), revenueForLine: itemRevenueExpression(),
    } },
    { $set: {
      costForLine: { $ifNull: ["$items.costPriceMinorSnapshot", { $ifNull: ["$currentVariant.pricing.costPriceMinor", 0] }] },
      usedSnapshot: { $ne: [{ $ifNull: ["$items.costPriceMinorSnapshot", null] }, null] },
    } },
    { $set: { cogsForLine: { $round: [{ $multiply: ["$costForLine", "$quantityForCost"] }, 0] } } },
    { $group: {
      _id: { productId: "$items.productId", variantId: "$items.variantId", sku: "$items.skuSnapshot", name: "$items.productNameSnapshot" },
      quantity: { $sum: "$quantityForCost" }, revenueMinor: { $sum: "$revenueForLine" }, cogsMinor: { $sum: "$cogsForLine" },
      snapshotCostLines: { $sum: { $cond: ["$usedSnapshot", 1, 0] } }, fallbackCostLines: { $sum: { $cond: ["$usedSnapshot", 0, 1] } },
    } },
    { $set: { grossProfitMinor: { $subtract: ["$revenueMinor", "$cogsMinor"] } } },
    { $sort: { revenueMinor: -1 } },
    { $project: { _id: 0, productId: { $toString: "$_id.productId" }, productName: "$_id.name", sku: "$_id.sku", quantity: 1, revenueMinor: 1, cogsMinor: 1, grossProfitMinor: 1, snapshotCostLines: 1, fallbackCostLines: 1 } },
  ]);
  const summary = rows.reduce((acc, row) => ({ revenueMinor: acc.revenueMinor + row.revenueMinor, cogsMinor: acc.cogsMinor + row.cogsMinor, grossProfitMinor: acc.grossProfitMinor + row.grossProfitMinor, snapshotCostLines: acc.snapshotCostLines + row.snapshotCostLines, fallbackCostLines: acc.fallbackCostLines + row.fallbackCostLines }), { revenueMinor: 0, cogsMinor: 0, grossProfitMinor: 0, snapshotCostLines: 0, fallbackCostLines: 0 });
  const costLines = summary.snapshotCostLines + summary.fallbackCostLines;
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { ...summary, grossMarginBasisPoints: summary.revenueMinor > 0 ? Math.round(summary.grossProfitMinor * 10_000 / summary.revenueMinor) : 0, snapshotCoverageBasisPoints: costLines > 0 ? Math.round(summary.snapshotCostLines * 10_000 / costLines) : 0, costBasis: "ORDER_SNAPSHOT_WITH_CURRENT_PRODUCT_COST_FALLBACK" as const }, products: rows.slice(0, 100) };
}

export async function getInventoryReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match: Record<string, unknown> = {};
  const storeId = storeObjectId(filters);
  if (storeId) match.storeId = storeId;
  const rows = await InventoryModel.aggregate<{
    inventoryId: string; storeId: string; storeName: string; productId: string; productName: string; sku: string; quantityOnHand: number; quantityReserved: number; quantityAvailable: number; reorderLevel: number; costPriceMinor: number; inventoryValueMinor: number;
  }>([
    { $match: match },
    { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } }, { $set: { product: { $first: "$product" } } },
    { $set: { variant: { $first: { $filter: { input: { $ifNull: ["$product.variants", []] }, as: "variant", cond: { $eq: ["$$variant._id", "$variantId"] } } } } } },
    { $lookup: { from: "storeLocations", localField: "storeId", foreignField: "_id", as: "store" } }, { $set: { store: { $first: "$store" } } },
    { $set: { costPriceMinor: { $ifNull: ["$variant.pricing.costPriceMinor", 0] } } },
    { $set: { inventoryValueMinor: { $round: [{ $multiply: ["$quantityOnHand", "$costPriceMinor"] }, 0] } } },
    { $sort: { inventoryValueMinor: -1 } },
    { $project: { _id: 0, inventoryId: { $toString: "$_id" }, storeId: { $toString: "$storeId" }, storeName: { $ifNull: ["$store.name", "Unknown Store"] }, productId: { $toString: "$productId" }, productName: { $ifNull: ["$product.name", "Unknown Product"] }, sku: { $ifNull: ["$variant.sku", ""] }, quantityOnHand: 1, quantityReserved: 1, quantityAvailable: 1, reorderLevel: 1, costPriceMinor: 1, inventoryValueMinor: 1 } },
  ]);
  const summary = rows.reduce((acc, row) => ({ skuCount: acc.skuCount + 1, quantityOnHand: acc.quantityOnHand + row.quantityOnHand, quantityReserved: acc.quantityReserved + row.quantityReserved, quantityAvailable: acc.quantityAvailable + row.quantityAvailable, inventoryValueMinor: acc.inventoryValueMinor + row.inventoryValueMinor, lowStockCount: acc.lowStockCount + (row.quantityAvailable > 0 && row.quantityAvailable <= row.reorderLevel ? 1 : 0), outOfStockCount: acc.outOfStockCount + (row.quantityAvailable <= 0 ? 1 : 0) }), { skuCount: 0, quantityOnHand: 0, quantityReserved: 0, quantityAvailable: 0, inventoryValueMinor: 0, lowStockCount: 0, outOfStockCount: 0 });
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary, items: rows.slice(0, 250) };
}

export async function getWasteExpiryReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const txMatch: Record<string, unknown> = { ...dateMatch(filters), type: { $in: WASTE_TYPES } };
  const batchMatch: Record<string, unknown> = { remainingQuantity: { $gt: 0 }, expiryDate: { $ne: null } };
  const storeId = storeObjectId(filters);
  if (storeId) { txMatch.storeId = storeId; batchMatch.storeId = storeId; }
  const now = new Date();
  const d7 = new Date(now.getTime() + 7 * 86_400_000);
  const d15 = new Date(now.getTime() + 15 * 86_400_000);
  const d30 = new Date(now.getTime() + 30 * 86_400_000);
  const [wasteRows, batches] = await Promise.all([
    InventoryTransactionModel.aggregate<{ reason: string; transactions: number; quantity: number; valueMinor: number }>([
      { $match: txMatch },
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } }, { $set: { product: { $first: "$product" } } },
      { $set: { variant: { $first: { $filter: { input: { $ifNull: ["$product.variants", []] }, as: "variant", cond: { $eq: ["$$variant._id", "$variantId"] } } } } } },
      { $set: { wasteQuantity: { $abs: { $min: ["$quantityOnHandDelta", 0] } }, costPriceMinor: { $ifNull: ["$variant.pricing.costPriceMinor", 0] } } },
      { $group: { _id: { $ifNull: ["$adjustmentReason", "$type"] }, transactions: { $sum: 1 }, quantity: { $sum: "$wasteQuantity" }, valueMinor: { $sum: { $round: [{ $multiply: ["$wasteQuantity", "$costPriceMinor"] }, 0] } } } },
      { $sort: { valueMinor: -1 } }, { $project: { _id: 0, reason: "$_id", transactions: 1, quantity: 1, valueMinor: 1 } },
    ]),
    InventoryBatchModel.aggregate<{ batchId: string; batchNumber: string; supplierName: string; expiryDate: Date; remainingQuantity: number; costPriceMinor: number; valueMinor: number; status: string }>([
      { $match: batchMatch },
      { $set: { valueMinor: { $round: [{ $multiply: ["$remainingQuantity", "$costPriceMinor"] }, 0] }, status: { $switch: { branches: [
        { case: { $lt: ["$expiryDate", now] }, then: "EXPIRED" },
        { case: { $lte: ["$expiryDate", d7] }, then: "WITHIN_7_DAYS" },
        { case: { $lte: ["$expiryDate", d15] }, then: "WITHIN_15_DAYS" },
        { case: { $lte: ["$expiryDate", d30] }, then: "WITHIN_30_DAYS" },
      ], default: "LATER" } } } },
      { $sort: { expiryDate: 1 } },
      { $project: { _id: 0, batchId: { $toString: "$_id" }, batchNumber: 1, supplierName: 1, expiryDate: 1, remainingQuantity: 1, costPriceMinor: 1, valueMinor: 1, status: 1 } },
    ]),
  ]);
  const wasteSummary = wasteRows.reduce((acc, row) => ({ transactions: acc.transactions + row.transactions, quantity: acc.quantity + row.quantity, valueMinor: acc.valueMinor + row.valueMinor }), { transactions: 0, quantity: 0, valueMinor: 0 });
  const expirySummary = { expiredQuantity: 0, expiredValueMinor: 0, within7DaysQuantity: 0, within7DaysValueMinor: 0, within15DaysQuantity: 0, within15DaysValueMinor: 0, within30DaysQuantity: 0, within30DaysValueMinor: 0 };
  for (const batch of batches) {
    if (batch.status === "EXPIRED") { expirySummary.expiredQuantity += batch.remainingQuantity; expirySummary.expiredValueMinor += batch.valueMinor; }
    if (["WITHIN_7_DAYS"].includes(batch.status)) { expirySummary.within7DaysQuantity += batch.remainingQuantity; expirySummary.within7DaysValueMinor += batch.valueMinor; }
    if (["WITHIN_7_DAYS", "WITHIN_15_DAYS"].includes(batch.status)) { expirySummary.within15DaysQuantity += batch.remainingQuantity; expirySummary.within15DaysValueMinor += batch.valueMinor; }
    if (["WITHIN_7_DAYS", "WITHIN_15_DAYS", "WITHIN_30_DAYS"].includes(batch.status)) { expirySummary.within30DaysQuantity += batch.remainingQuantity; expirySummary.within30DaysValueMinor += batch.valueMinor; }
  }
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, wasteSummary, byReason: wasteRows, expirySummary, batches: batches.slice(0, 250).map((batch) => ({ ...batch, expiryDate: batch.expiryDate.toISOString() })) };
}

export async function getCustomerReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match = orderMatch(filters);
  const [newCustomers, customerSpendRows, guestRows, orderSummaryRows] = await Promise.all([
    CustomerModel.countDocuments(dateMatch(filters)),
    OrderModel.aggregate<{ customerId: string; firstName: string; lastName: string; email: string; orders: number; spendMinor: number }>([
      { $match: { ...match, customerId: { $ne: null } } },
      { $group: { _id: "$customerId", firstName: { $first: "$contactSnapshot.firstName" }, lastName: { $first: "$contactSnapshot.lastName" }, email: { $first: "$contactSnapshot.email" }, orders: { $sum: 1 }, spendMinor: { $sum: fulfilledGrossExpression() } } },
      { $sort: { spendMinor: -1 } }, { $limit: 100 },
      { $project: { _id: 0, customerId: { $toString: "$_id" }, firstName: 1, lastName: 1, email: 1, orders: 1, spendMinor: 1 } },
    ]),
    OrderModel.countDocuments({ ...match, customerId: null }),
    OrderModel.aggregate<{ orders: number; grossMinor: number }>([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, grossMinor: { $sum: fulfilledGrossExpression() } } }]),
  ]);
  const returningCustomers = customerSpendRows.filter((row) => row.orders > 1).length;
  const registeredPurchasers = customerSpendRows.length;
  const os = orderSummaryRows[0] ?? { orders: 0, grossMinor: 0 };
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { newCustomers, registeredPurchasers, returningCustomers, guestOrders: guestRows, averageOrderValueMinor: os.orders > 0 ? Math.round(os.grossMinor / os.orders) : 0 }, topCustomers: customerSpendRows };
}

export async function getSupplierReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const receiptMatch: Record<string, unknown> = dateMatch(filters, "receivedAt");
  const poMatch: Record<string, unknown> = dateMatch(filters);
  const storeId = storeObjectId(filters);
  if (storeId) { receiptMatch.storeId = storeId; poMatch.storeId = storeId; }
  if (filters.currency) { receiptMatch.currency = filters.currency; poMatch.currency = filters.currency; }
  const [supplierRows, poStatuses] = await Promise.all([
    GoodsReceiptModel.aggregate<{ supplierId: string; supplierName: string; receipts: number; acceptedCostMinor: number; acceptedQuantity: number }>([
      { $match: receiptMatch }, { $unwind: "$items" },
      { $group: { _id: "$supplierId", receiptsSet: { $addToSet: "$_id" }, acceptedCostMinor: { $sum: "$items.acceptedCostMinor" }, acceptedQuantity: { $sum: "$items.acceptedQuantity" } } },
      { $lookup: { from: "suppliers", localField: "_id", foreignField: "_id", as: "supplier" } }, { $set: { supplier: { $first: "$supplier" } } },
      { $set: { receipts: { $size: "$receiptsSet" } } }, { $sort: { acceptedCostMinor: -1 } },
      { $project: { _id: 0, supplierId: { $toString: "$_id" }, supplierName: { $ifNull: ["$supplier.companyName", "Unknown Supplier"] }, receipts: 1, acceptedCostMinor: 1, acceptedQuantity: 1 } },
    ]),
    PurchaseOrderModel.aggregate<{ status: string; count: number; amountMinor: number }>([
      { $match: poMatch }, { $group: { _id: "$status", count: { $sum: 1 }, amountMinor: { $sum: "$subtotalMinor" } } },
      { $project: { _id: 0, status: "$_id", count: 1, amountMinor: 1 } },
    ]),
  ]);
  const summary = supplierRows.reduce((acc, row) => ({ suppliersUsed: acc.suppliersUsed + 1, receipts: acc.receipts + row.receipts, receivedCostMinor: acc.receivedCostMinor + row.acceptedCostMinor, receivedQuantity: acc.receivedQuantity + row.acceptedQuantity }), { suppliersUsed: 0, receipts: 0, receivedCostMinor: 0, receivedQuantity: 0 });
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { ...summary, purchaseOrders: poStatuses.reduce((sum, row) => sum + row.count, 0) }, topSuppliers: supplierRows, purchaseOrderStatuses: poStatuses };
}

export async function getPaymentReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match: Record<string, unknown> = dateMatch(filters);
  const refundMatch: Record<string, unknown> = dateMatch(filters);
  const storeId = storeObjectId(filters);
  if (storeId) match.storeId = storeId;
  if (filters.currency) { match.currency = filters.currency; refundMatch.currency = filters.currency; }
  const refundPipeline: PipelineStage[] = [
    { $match: refundMatch },
    { $lookup: { from: "payments", localField: "paymentId", foreignField: "_id", as: "payment" } },
    { $set: { payment: { $first: "$payment" } } },
  ];
  if (storeId) refundPipeline.push({ $match: { "payment.storeId": storeId } });
  refundPipeline.push(
    { $group: { _id: "$status", count: { $sum: 1 }, amountMinor: { $sum: "$amountMinor" } } },
    { $project: { _id: 0, status: "$_id", count: 1, amountMinor: 1 } },
  );
  const [paymentsByStatus, paymentSummaryRows, refundsByStatus] = await Promise.all([
    PaymentModel.aggregate<{ status: string; provider: string; count: number; capturedMinor: number; refundedMinor: number }>([
      { $match: match }, { $group: { _id: { status: "$status", provider: "$provider" }, count: { $sum: 1 }, capturedMinor: { $sum: "$capturedAmountMinor" }, refundedMinor: { $sum: "$refundedAmountMinor" } } },
      { $project: { _id: 0, status: "$_id.status", provider: "$_id.provider", count: 1, capturedMinor: 1, refundedMinor: 1 } },
    ]),
    PaymentModel.aggregate<{ paymentCount: number; capturedMinor: number; refundedMinor: number; failedCount: number; internalCount: number }>([
      { $match: match }, { $group: { _id: null, paymentCount: { $sum: 1 }, capturedMinor: { $sum: "$capturedAmountMinor" }, refundedMinor: { $sum: "$refundedAmountMinor" }, failedCount: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } }, internalCount: { $sum: { $cond: [{ $eq: ["$provider", "INTERNAL"] }, 1, 0] } } } },
    ]),
    RefundModel.aggregate<{ status: string; count: number; amountMinor: number }>(refundPipeline),
  ]);
  const summary = paymentSummaryRows[0] ?? { paymentCount: 0, capturedMinor: 0, refundedMinor: 0, failedCount: 0, internalCount: 0 };
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { ...summary, netCapturedMinor: Math.max(0, summary.capturedMinor - summary.refundedMinor), successfulRefundMinor: refundsByStatus.find((row) => row.status === "SUCCEEDED")?.amountMinor ?? 0 }, paymentsByStatus, refundsByStatus };
}

export async function getFulfillmentReport(input: ReportQueryInput) {
  const filters = normalizeReportFilters(input);
  const match = orderMatch(filters);
  const [summaryRows, byStatus, byDay] = await Promise.all([
    OrderModel.aggregate<{ orders: number; deliveryOrders: number; pickupOrders: number; completedDelivery: number; completedPickup: number; pickingDurationMs: number; pickingDurationCount: number; packingDurationMs: number; packingDurationCount: number }>([
      { $match: match },
      { $group: { _id: null, orders: { $sum: 1 }, deliveryOrders: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "DELIVERY"] }, 1, 0] } }, pickupOrders: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "PICKUP"] }, 1, 0] } }, completedDelivery: { $sum: { $cond: [{ $eq: ["$orderStatus", "DELIVERED"] }, 1, 0] } }, completedPickup: { $sum: { $cond: [{ $eq: ["$orderStatus", "PICKED_UP"] }, 1, 0] } }, pickingDurationMs: { $sum: { $cond: [{ $and: [{ $ne: ["$picking.startedAt", null] }, { $ne: ["$picking.completedAt", null] }] }, { $subtract: ["$picking.completedAt", "$picking.startedAt"] }, 0] } }, pickingDurationCount: { $sum: { $cond: [{ $and: [{ $ne: ["$picking.startedAt", null] }, { $ne: ["$picking.completedAt", null] }] }, 1, 0] } }, packingDurationMs: { $sum: { $cond: [{ $and: [{ $ne: ["$picking.completedAt", null] }, { $ne: ["$packing.completedAt", null] }] }, { $subtract: ["$packing.completedAt", "$picking.completedAt"] }, 0] } }, packingDurationCount: { $sum: { $cond: [{ $and: [{ $ne: ["$picking.completedAt", null] }, { $ne: ["$packing.completedAt", null] }] }, 1, 0] } } } },
    ]),
    OrderModel.aggregate<{ status: string; fulfillmentType: string; count: number }>([
      { $match: match }, { $group: { _id: { status: "$orderStatus", fulfillmentType: "$fulfillmentType" }, count: { $sum: 1 } } }, { $sort: { count: -1 } },
      { $project: { _id: 0, status: "$_id.status", fulfillmentType: "$_id.fulfillmentType", count: 1 } },
    ]),
    OrderModel.aggregate<{ date: string; delivery: number; pickup: number }>([
      { $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, delivery: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "DELIVERY"] }, 1, 0] } }, pickup: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "PICKUP"] }, 1, 0] } } } }, { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", delivery: 1, pickup: 1 } },
    ]),
  ]);
  const raw = summaryRows[0] ?? { orders: 0, deliveryOrders: 0, pickupOrders: 0, completedDelivery: 0, completedPickup: 0, pickingDurationMs: 0, pickingDurationCount: 0, packingDurationMs: 0, packingDurationCount: 0 };
  return { filters: { from: filters.fromDate, to: filters.toDate, storeId: filters.storeId ?? null, currency: filters.currency ?? null }, summary: { orders: raw.orders, deliveryOrders: raw.deliveryOrders, pickupOrders: raw.pickupOrders, completedDelivery: raw.completedDelivery, completedPickup: raw.completedPickup, averagePickingMinutes: raw.pickingDurationCount > 0 ? Math.round(raw.pickingDurationMs / raw.pickingDurationCount / 60_000) : 0, averagePackingMinutes: raw.packingDurationCount > 0 ? Math.round(raw.packingDurationMs / raw.packingDurationCount / 60_000) : 0 }, byStatus, byDay };
}

export async function getOverviewReport(input: ReportQueryInput) {
  const [sales, inventory, customers, payments, wasteExpiry, fulfillment] = await Promise.all([
    getSalesReport(input), getInventoryReport(input), getCustomerReport(input), getPaymentReport(input), getWasteExpiryReport(input), getFulfillmentReport(input),
  ]);
  return { filters: sales.filters, sales: sales.summary, inventory: inventory.summary, customers: customers.summary, payments: payments.summary, waste: wasteExpiry.wasteSummary, expiry: wasteExpiry.expirySummary, fulfillment: fulfillment.summary };
}

export async function getReport(report: string, input: ReportQueryInput): Promise<unknown> {
  switch (report) {
    case "overview": return getOverviewReport(input);
    case "sales": return getSalesReport(input);
    case "profitability": return getProfitabilityReport(input);
    case "inventory": return getInventoryReport(input);
    case "waste-expiry": return getWasteExpiryReport(input);
    case "customers": return getCustomerReport(input);
    case "suppliers": return getSupplierReport(input);
    case "payments": return getPaymentReport(input);
    case "fulfillment": return getFulfillmentReport(input);
    default: throw new Error("Unsupported report type.");
  }
}

export async function listReportStores() {
  const stores = await StoreLocationModel.find({}).sort({ name: 1 }).select({ name: 1, code: 1, status: 1 }).lean();
  return stores.map((store) => ({ id: store._id.toString(), name: store.name, code: store.code, status: store.status }));
}

export async function buildExportTable(report: string, input: ReportQueryInput): Promise<ExportTable> {
  switch (report) {
    case "sales": {
      const data = await getSalesReport(input);
      return { title: `Sales Report ${data.filters.from} to ${data.filters.to}`, headers: ["Date", "Orders", "Gross Sales (minor)"], rows: data.byDay.map((row) => [row.date, row.orders, row.grossSalesMinor]) };
    }
    case "profitability": {
      const data = await getProfitabilityReport(input);
      return { title: `Profitability Report ${data.filters.from} to ${data.filters.to}`, headers: ["Product", "SKU", "Quantity", "Revenue (minor)", "COGS (minor)", "Gross Profit (minor)"], rows: data.products.map((row) => [row.productName, row.sku, row.quantity, row.revenueMinor, row.cogsMinor, row.grossProfitMinor]) };
    }
    case "inventory": {
      const data = await getInventoryReport(input);
      return { title: "Inventory Report", headers: ["Store", "Product", "SKU", "On Hand", "Reserved", "Available", "Reorder Level", "Cost (minor)", "Inventory Value (minor)"], rows: data.items.map((row) => [row.storeName, row.productName, row.sku, row.quantityOnHand, row.quantityReserved, row.quantityAvailable, row.reorderLevel, row.costPriceMinor, row.inventoryValueMinor]) };
    }
    case "waste-expiry": {
      const data = await getWasteExpiryReport(input);
      return { title: `Waste & Expiry Report ${data.filters.from} to ${data.filters.to}`, headers: ["Batch", "Supplier", "Expiry Date", "Status", "Remaining Quantity", "Value (minor)"], rows: data.batches.map((row) => [row.batchNumber, row.supplierName, row.expiryDate, row.status, row.remainingQuantity, row.valueMinor]) };
    }
    case "customers": {
      const data = await getCustomerReport(input);
      return { title: `Customer Report ${data.filters.from} to ${data.filters.to}`, headers: ["Customer", "Email", "Orders", "Spend (minor)"], rows: data.topCustomers.map((row) => [`${row.firstName} ${row.lastName}`.trim(), row.email, row.orders, row.spendMinor]) };
    }
    case "suppliers": {
      const data = await getSupplierReport(input);
      return { title: `Supplier Report ${data.filters.from} to ${data.filters.to}`, headers: ["Supplier", "Receipts", "Accepted Quantity", "Accepted Cost (minor)"], rows: data.topSuppliers.map((row) => [row.supplierName, row.receipts, row.acceptedQuantity, row.acceptedCostMinor]) };
    }
    case "payments": {
      const data = await getPaymentReport(input);
      return { title: `Payment Report ${data.filters.from} to ${data.filters.to}`, headers: ["Provider", "Status", "Count", "Captured (minor)", "Refunded (minor)"], rows: data.paymentsByStatus.map((row) => [row.provider, row.status, row.count, row.capturedMinor, row.refundedMinor]) };
    }
    case "fulfillment": {
      const data = await getFulfillmentReport(input);
      return { title: `Fulfillment Report ${data.filters.from} to ${data.filters.to}`, headers: ["Fulfillment Type", "Status", "Orders"], rows: data.byStatus.map((row) => [row.fulfillmentType, row.status, row.count]) };
    }
    case "overview": {
      const data = await getOverviewReport(input);
      return { title: `Executive Overview ${data.filters.from} to ${data.filters.to}`, headers: ["Metric", "Value"], rows: [["Orders", data.sales.orders], ["Gross Sales (minor)", data.sales.grossSalesMinor], ["Net Revenue (minor)", data.sales.netRevenueMinor], ["Inventory Value (minor)", data.inventory.inventoryValueMinor], ["New Customers", data.customers.newCustomers], ["Waste Value (minor)", data.waste.valueMinor], ["Delivery Orders", data.fulfillment.deliveryOrders], ["Pickup Orders", data.fulfillment.pickupOrders]] };
    }
    default: throw new Error("Unsupported report type.");
  }
}

export async function estimateHistoricalCostCoverage(input: ReportQueryInput) {
  return getProfitabilityReport(input);
}