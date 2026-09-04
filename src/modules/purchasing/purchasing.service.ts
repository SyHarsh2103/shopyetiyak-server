import mongoose, { type ClientSession, Types } from "mongoose";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

import {
  receiveInventoryBatchInSession,
  returnInventoryToSupplierInSession,
  type InventoryActor,
} from "../inventory/inventory.service.js";
import { InventoryBatchModel } from "../inventory/inventory-batch.model.js";
import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { SupplierModel } from "../suppliers/supplier.model.js";
import { SupplierProductModel } from "../suppliers/supplier-product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { GoodsReceiptModel } from "./goods-receipt.model.js";
import { PurchaseOrderModel, type PURCHASE_ORDER_STATUSES } from "./purchase-order.model.js";
import { SupplierReturnModel } from "./supplier-return.model.js";
import type {
  createPurchaseOrderSchema,
  goodsReceiptListQuerySchema,
  goodsReceiptSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderTransitionSchema,
  supplierReturnListQuerySchema,
  supplierReturnSchema,
  updatePurchaseOrderSchema,
} from "./purchasing.validation.js";

type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
type PurchaseOrderTransitionInput = z.infer<typeof purchaseOrderTransitionSchema>;
type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
type GoodsReceiptListQuery = z.infer<typeof goodsReceiptListQuerySchema>;
type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;
type SupplierReturnListQuery = z.infer<typeof supplierReturnListQuerySchema>;
type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export interface PurchasingActor extends InventoryActor {
  adminUserId?: string;
  roleNames?: string[];
}

function escapedRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function documentNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function roundedMoney(quantity: number, unitCostMinor: number): number {
  return Math.round(quantity * unitCostMinor);
}

async function withPurchasingTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new Error("Purchasing transaction completed without a result.");
    return result;
  } finally {
    await session.endSession();
  }
}

async function assertActiveSupplier(supplierId: string, session?: ClientSession) {
  const query = SupplierModel.findOne({ _id: supplierId, status: "ACTIVE" });
  if (session) query.session(session);
  const supplier = await query;
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Active supplier not found.");
  return supplier;
}

async function assertActiveStore(storeId: string, session?: ClientSession) {
  const query = StoreLocationModel.findOne({ _id: storeId, status: "ACTIVE" });
  if (session) query.session(session);
  const store = await query;
  if (!store) throw new ApiError(404, "STORE_NOT_FOUND", "Active store location not found.");
  return store;
}

async function buildPurchaseOrderItems(
  supplierId: string,
  items: CreatePurchaseOrderInput["items"],
  currency: string,
) {
  const output: Array<{
    productId: Types.ObjectId;
    variantId: Types.ObjectId;
    productNameSnapshot: string;
    skuSnapshot: string;
    supplierSkuSnapshot: string;
    orderedQuantity: number;
    receivedQuantity: number;
    unitCostMinor: number;
    lineTotalMinor: number;
  }> = [];

  for (const item of items) {
    const product = await ProductModel.findOne({
      _id: item.productId,
      archivedAt: null,
      "variants._id": item.variantId,
    }).lean();
    if (!product) {
      throw new ApiError(404, "PRODUCT_VARIANT_NOT_FOUND", "One of the selected product variants does not exist or is archived.");
    }
    const variant = product.variants.find((entry) => entry._id.toString() === item.variantId);
    if (!variant || variant.status !== "ACTIVE") {
      throw new ApiError(409, "PRODUCT_VARIANT_INACTIVE", "One of the selected product variants is inactive.");
    }

    const supplierProduct = await SupplierProductModel.findOne({
      supplierId: new Types.ObjectId(supplierId),
      productId: new Types.ObjectId(item.productId),
      variantId: new Types.ObjectId(item.variantId),
      isActive: true,
    }).lean();

    if (supplierProduct && supplierProduct.currency !== currency) {
      throw new ApiError(409, "SUPPLIER_PRODUCT_CURRENCY_MISMATCH", "Supplier product currency does not match the purchase order currency.");
    }

    output.push({
      productId: new Types.ObjectId(item.productId),
      variantId: new Types.ObjectId(item.variantId),
      productNameSnapshot: product.name,
      skuSnapshot: variant.sku,
      supplierSkuSnapshot: supplierProduct?.supplierSku ?? "",
      orderedQuantity: item.orderedQuantity,
      receivedQuantity: 0,
      unitCostMinor: item.unitCostMinor,
      lineTotalMinor: roundedMoney(item.orderedQuantity, item.unitCostMinor),
    });
  }

  return output;
}

async function enrichPurchaseOrders<T extends { supplierId: Types.ObjectId; storeId: Types.ObjectId }>(records: T[]) {
  if (records.length === 0) return [];
  const supplierIds = [...new Set(records.map((record) => record.supplierId.toString()))];
  const storeIds = [...new Set(records.map((record) => record.storeId.toString()))];
  const [suppliers, stores] = await Promise.all([
    SupplierModel.find({ _id: { $in: supplierIds } }).select({ companyName: 1, status: 1 }).lean(),
    StoreLocationModel.find({ _id: { $in: storeIds } }).select({ name: 1, code: 1 }).lean(),
  ]);
  const supplierMap = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
  const storeMap = new Map(stores.map((store) => [store._id.toString(), store]));
  return records.map((record) => ({
    ...record,
    supplier: supplierMap.get(record.supplierId.toString()) ?? null,
    store: storeMap.get(record.storeId.toString()) ?? null,
  }));
}

export async function listPurchaseOrders(query: PurchaseOrderListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = escapedRegex(query.search);
    const suppliers = await SupplierModel.find({ companyName: regex }).select({ _id: 1 }).lean();
    filter.$or = [
      { purchaseOrderNumber: regex },
      { supplierId: { $in: suppliers.map((supplier) => supplier._id) } },
      { "items.productNameSnapshot": regex },
      { "items.skuSnapshot": regex },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    PurchaseOrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    PurchaseOrderModel.countDocuments(filter),
  ]);
  return {
    items: await enrichPurchaseOrders(records),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function getPurchaseOrder(id: string) {
  const order = await PurchaseOrderModel.findById(id).lean();
  if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
  return (await enrichPurchaseOrders([order]))[0];
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, actor?: PurchasingActor) {
  await assertActiveSupplier(input.supplierId);
  await assertActiveStore(input.storeId);
  const items = await buildPurchaseOrderItems(input.supplierId, input.items, input.currency);
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  return PurchaseOrderModel.create({
    purchaseOrderNumber: documentNumber("PO"),
    supplierId: new Types.ObjectId(input.supplierId),
    storeId: new Types.ObjectId(input.storeId),
    status: "DRAFT",
    currency: input.currency,
    items,
    subtotalMinor,
    expectedDeliveryDate: input.expectedDeliveryDate,
    notes: input.notes,
    createdByAdminId: actor?.adminUserId ? new Types.ObjectId(actor.adminUserId) : null,
  });
}

export async function updatePurchaseOrder(id: string, input: UpdatePurchaseOrderInput) {
  const order = await PurchaseOrderModel.findById(id);
  if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
  if (order.status !== "DRAFT") {
    throw new ApiError(409, "PURCHASE_ORDER_NOT_EDITABLE", "Only draft purchase orders can be edited.");
  }

  const supplierId = input.supplierId ?? order.supplierId.toString();
  const storeId = input.storeId ?? order.storeId.toString();
  const currency = input.currency ?? order.currency;
  await assertActiveSupplier(supplierId);
  await assertActiveStore(storeId);

  if (input.supplierId) order.supplierId = new Types.ObjectId(input.supplierId);
  if (input.storeId) order.storeId = new Types.ObjectId(input.storeId);
  if (input.currency) order.currency = input.currency;
  if (input.expectedDeliveryDate !== undefined) order.expectedDeliveryDate = input.expectedDeliveryDate;
  if (input.notes !== undefined) order.notes = input.notes;

  const shouldRebuildItems = Boolean(input.items || input.supplierId || input.currency);
  if (shouldRebuildItems) {
    const sourceItems = input.items ?? order.items.map((item) => ({
      productId: item.productId.toString(),
      variantId: item.variantId.toString(),
      orderedQuantity: item.orderedQuantity,
      unitCostMinor: item.unitCostMinor,
    }));
    const items = await buildPurchaseOrderItems(supplierId, sourceItems, currency);
    order.set("items", items);
    order.subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  }

  await order.save();
  return order;
}

const allowedTransitions: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["CANCELLED"],
  PARTIALLY_RECEIVED: ["CLOSED"],
  RECEIVED: ["CLOSED"],
  CANCELLED: [],
  CLOSED: [],
};

export async function transitionPurchaseOrder(id: string, input: PurchaseOrderTransitionInput, actor?: PurchasingActor) {
  const order = await PurchaseOrderModel.findById(id);
  if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
  const target = input.status as PurchaseOrderStatus;
  if (!allowedTransitions[order.status].includes(target)) {
    throw new ApiError(409, "PURCHASE_ORDER_STATUS_INVALID", `Purchase order cannot move from ${order.status} to ${target}.`);
  }

  if (target === "CANCELLED" && order.items.some((item) => item.receivedQuantity > 0)) {
    throw new ApiError(409, "PURCHASE_ORDER_HAS_RECEIPTS", "A purchase order with received stock cannot be cancelled.");
  }

  const now = new Date();
  const actorId = actor?.adminUserId ? new Types.ObjectId(actor.adminUserId) : null;
  order.status = target;
  if (input.note) order.notes = order.notes ? `${order.notes}\n${input.note}` : input.note;
  if (target === "APPROVED") {
    order.approvedAt = now;
    order.approvedByAdminId = actorId;
  }
  if (target === "SENT") {
    order.sentAt = now;
    order.sentByAdminId = actorId;
  }
  if (target === "CANCELLED") {
    order.cancelledAt = now;
    order.cancelledByAdminId = actorId;
  }
  if (target === "CLOSED") {
    order.closedAt = now;
    order.closedByAdminId = actorId;
  }
  await order.save();
  return order;
}

export async function receiveGoods(input: GoodsReceiptInput, actor?: PurchasingActor) {
  return withPurchasingTransaction(async (session) => {
    const order = await PurchaseOrderModel.findById(input.purchaseOrderId).session(session);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
    if (!(["SENT", "PARTIALLY_RECEIVED"] as PurchaseOrderStatus[]).includes(order.status)) {
      throw new ApiError(409, "PURCHASE_ORDER_NOT_RECEIVABLE", "Only sent or partially received purchase orders can receive goods.");
    }

    const supplier = await assertActiveSupplier(order.supplierId.toString(), session);
    await assertActiveStore(order.storeId.toString(), session);

    const receiptId = new Types.ObjectId();
    const receiptNumber = documentNumber("GRN");
    const receiptItems: Array<{
      purchaseOrderItemId: Types.ObjectId;
      productId: Types.ObjectId;
      variantId: Types.ObjectId;
      skuSnapshot: string;
      batchNumber: string;
      quantityReceived: number;
      damagedQuantity: number;
      acceptedQuantity: number;
      unitCostMinor: number;
      acceptedCostMinor: number;
      manufacturingDate: Date | null;
      expiryDate: Date | null;
      inventoryBatchId: Types.ObjectId | null;
    }> = [];

    for (const line of input.items) {
      const purchaseOrderItem = order.items.id(line.purchaseOrderItemId);
      if (!purchaseOrderItem) {
        throw new ApiError(404, "PURCHASE_ORDER_ITEM_NOT_FOUND", "One of the selected purchase order items does not exist.");
      }

      const acceptedQuantity = line.quantityReceived - line.damagedQuantity;
      const remainingOrdered = purchaseOrderItem.orderedQuantity - purchaseOrderItem.receivedQuantity;
      if (acceptedQuantity > remainingOrdered + 1e-9) {
        throw new ApiError(409, "PURCHASE_ORDER_OVER_RECEIPT", "Accepted quantity exceeds the remaining quantity on the purchase order line.");
      }

      const unitCostMinor = line.unitCostMinor ?? purchaseOrderItem.unitCostMinor;
      let inventoryBatchId: Types.ObjectId | null = null;
      if (acceptedQuantity > 0) {
        const inventoryResult = await receiveInventoryBatchInSession(
          session,
          {
            storeId: order.storeId.toString(),
            productId: purchaseOrderItem.productId.toString(),
            variantId: purchaseOrderItem.variantId.toString(),
            batchNumber: line.batchNumber,
            supplierId: order.supplierId.toString(),
            supplierName: supplier.companyName,
            receivedDate: input.receivedAt,
            manufacturingDate: line.manufacturingDate,
            expiryDate: line.expiryDate,
            receivedQuantity: acceptedQuantity,
            costPriceMinor: unitCostMinor,
            currency: order.currency,
            note: `Goods receipt ${receiptNumber}`,
            mergeExistingBatch: true,
            referenceType: "GOODS_RECEIPT",
            referenceId: receiptId.toString(),
          },
          actor,
        );
        inventoryBatchId = inventoryResult.batch._id;
        purchaseOrderItem.receivedQuantity += acceptedQuantity;

        await SupplierProductModel.updateOne(
          {
            supplierId: order.supplierId,
            productId: purchaseOrderItem.productId,
            variantId: purchaseOrderItem.variantId,
          },
          {
            $set: {
              lastReceivedCostMinor: unitCostMinor,
              lastReceivedAt: input.receivedAt,
            },
          },
          { session },
        );
      }

      receiptItems.push({
        purchaseOrderItemId: purchaseOrderItem._id,
        productId: purchaseOrderItem.productId,
        variantId: purchaseOrderItem.variantId,
        skuSnapshot: purchaseOrderItem.skuSnapshot,
        batchNumber: line.batchNumber,
        quantityReceived: line.quantityReceived,
        damagedQuantity: line.damagedQuantity,
        acceptedQuantity,
        unitCostMinor,
        acceptedCostMinor: roundedMoney(acceptedQuantity, unitCostMinor),
        manufacturingDate: line.manufacturingDate,
        expiryDate: line.expiryDate,
        inventoryBatchId,
      });
    }

    order.status = order.items.every((item) => item.receivedQuantity + 1e-9 >= item.orderedQuantity)
      ? "RECEIVED"
      : "PARTIALLY_RECEIVED";
    await order.save({ session });

    const totalAcceptedCostMinor = receiptItems.reduce((sum, item) => sum + item.acceptedCostMinor, 0);
    const [receipt] = await GoodsReceiptModel.create([{
      _id: receiptId,
      receiptNumber,
      purchaseOrderId: order._id,
      supplierId: order.supplierId,
      storeId: order.storeId,
      currency: order.currency,
      items: receiptItems,
      totalAcceptedCostMinor,
      notes: input.notes,
      receivedByAdminId: actor?.adminUserId ? new Types.ObjectId(actor.adminUserId) : null,
      receivedAt: input.receivedAt,
    }], { session });
    if (!receipt) throw new Error("Goods receipt was not created.");

    return { purchaseOrder: order, receipt };
  });
}

export async function listGoodsReceipts(query: GoodsReceiptListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.purchaseOrderId) filter.purchaseOrderId = new Types.ObjectId(query.purchaseOrderId);
  if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    GoodsReceiptModel.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(query.limit).lean(),
    GoodsReceiptModel.countDocuments(filter),
  ]);
  return {
    items: await enrichPurchaseOrders(records),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function createSupplierReturn(input: SupplierReturnInput, actor?: PurchasingActor) {
  return withPurchasingTransaction(async (session) => {
    await assertActiveSupplier(input.supplierId, session);
    await assertActiveStore(input.storeId, session);

    if (input.purchaseOrderId) {
      const order = await PurchaseOrderModel.findOne({
        _id: input.purchaseOrderId,
        supplierId: input.supplierId,
        storeId: input.storeId,
      }).session(session).lean();
      if (!order) throw new ApiError(409, "SUPPLIER_RETURN_PO_INVALID", "Purchase order does not match the selected supplier and store.");
    }
    if (input.goodsReceiptId) {
      const receipt = await GoodsReceiptModel.findOne({
        _id: input.goodsReceiptId,
        supplierId: input.supplierId,
        storeId: input.storeId,
      }).session(session).lean();
      if (!receipt) throw new ApiError(409, "SUPPLIER_RETURN_RECEIPT_INVALID", "Goods receipt does not match the selected supplier and store.");
    }

    const returnId = new Types.ObjectId();
    const returnNumber = documentNumber("SR");
    const returnItems: Array<{
      batchId: Types.ObjectId;
      productId: Types.ObjectId;
      variantId: Types.ObjectId;
      batchNumber: string;
      quantity: number;
      unitCostMinor: number;
      currency: string;
      lineValueMinor: number;
      reason: string;
    }> = [];

    for (const line of input.items) {
      const result = await returnInventoryToSupplierInSession(
        session,
        {
          supplierId: input.supplierId,
          storeId: input.storeId,
          batchId: line.batchId,
          quantity: line.quantity,
          referenceType: "SUPPLIER_RETURN",
          referenceId: returnId.toString(),
          note: `${returnNumber}: ${line.reason}`,
        },
        actor,
      );

      const batchRecord = await InventoryBatchModel.findById(line.batchId).session(session).lean();
      if (!batchRecord) throw new ApiError(404, "INVENTORY_BATCH_NOT_FOUND", "Supplier return batch was not found.");
      const batchCurrency = batchRecord.currency ?? "USD";
      const lineValueMinor = roundedMoney(line.quantity, result.batch.costPriceMinor);
      if (returnItems[0] && returnItems[0].currency !== batchCurrency) {
        throw new ApiError(409, "SUPPLIER_RETURN_CURRENCY_MISMATCH", "All supplier return items must use the same currency.");
      }
      returnItems.push({
        batchId: result.batch.batchId,
        productId: batchRecord.productId,
        variantId: batchRecord.variantId,
        batchNumber: result.batch.batchNumber,
        quantity: line.quantity,
        unitCostMinor: result.batch.costPriceMinor,
        currency: batchCurrency,
        lineValueMinor,
        reason: line.reason,
      });
    }

    const totalValueMinor = returnItems.reduce((sum, item) => sum + item.lineValueMinor, 0);
    const [supplierReturn] = await SupplierReturnModel.create([{
      _id: returnId,
      returnNumber,
      supplierId: new Types.ObjectId(input.supplierId),
      storeId: new Types.ObjectId(input.storeId),
      currency: returnItems[0]?.currency ?? "USD",
      purchaseOrderId: input.purchaseOrderId ? new Types.ObjectId(input.purchaseOrderId) : null,
      goodsReceiptId: input.goodsReceiptId ? new Types.ObjectId(input.goodsReceiptId) : null,
      items: returnItems,
      totalValueMinor,
      notes: input.notes,
      returnedByAdminId: actor?.adminUserId ? new Types.ObjectId(actor.adminUserId) : null,
      returnedAt: new Date(),
    }], { session });
    if (!supplierReturn) throw new Error("Supplier return was not created.");
    return supplierReturn;
  });
}

export async function listSupplierReturns(query: SupplierReturnListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
  if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
  if (query.purchaseOrderId) filter.purchaseOrderId = new Types.ObjectId(query.purchaseOrderId);
  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    SupplierReturnModel.find(filter).sort({ returnedAt: -1 }).skip(skip).limit(query.limit).lean(),
    SupplierReturnModel.countDocuments(filter),
  ]);
  return {
    items: await enrichPurchaseOrders(records),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}
