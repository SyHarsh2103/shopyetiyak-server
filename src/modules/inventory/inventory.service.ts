import mongoose, {
  type ClientSession,
  Types,
} from "mongoose";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { ProductModel } from "../products/product.model.js";
import { StoreLocationModel } from "../stores/store-location.model.js";
import { StoreProductModel } from "../stores/store-product.model.js";
import { ApiError } from "../../utils/api-error.js";
import { InventoryBatchModel } from "./inventory-batch.model.js";
import { InventoryModel } from "./inventory.model.js";
import { InventoryTransactionModel } from "./inventory-transaction.model.js";

import type {
  INVENTORY_ADJUSTMENT_REASONS,
  INVENTORY_TRANSACTION_TYPES,
} from "./inventory-transaction.model.js";

import type {
  batchListQuerySchema,
  inventoryAdjustmentSchema,
  inventoryListQuerySchema,
  inventoryReservationSchema,
  inventoryTransferSchema,
  receiveBatchSchema,
  transactionListQuerySchema,
  updateReorderPolicySchema,
} from "./inventory.validation.js";

type InventoryListQuery =
  z.infer<typeof inventoryListQuerySchema>;

type BatchListQuery =
  z.infer<typeof batchListQuerySchema>;

type ReceiveBatchInput =
  Omit<z.infer<typeof receiveBatchSchema>, "currency"> & {
    currency?: string;
  };

type InventoryAdjustmentInput =
  z.infer<typeof inventoryAdjustmentSchema>;

export type InventoryReservationInput =
  z.infer<typeof inventoryReservationSchema>;

export interface InventoryCommitInput
  extends InventoryReservationInput {
  preferredBatchId?: string | null;
}

type InventoryTransferInput =
  z.infer<typeof inventoryTransferSchema>;

type TransactionListQuery =
  z.infer<typeof transactionListQuerySchema>;

type UpdateReorderPolicyInput =
  z.infer<typeof updateReorderPolicySchema>;

type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPES)[number];

type InventoryAdjustmentReason =
  (typeof INVENTORY_ADJUSTMENT_REASONS)[number];

export interface InventoryActor {
  adminUserId?: string;
  roleNames?: string[];
}

interface BalanceSnapshot {
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
}

interface ConsumedBatch {
  batchId: Types.ObjectId;
  batchNumber: string;
  quantity: number;
  supplierId: Types.ObjectId | null;
  supplierName: string;
  receivedDate: Date;
  manufacturingDate: Date | null;
  expiryDate: Date | null;
  costPriceMinor: number;
}

function balanceOf(
  value: BalanceSnapshot,
): BalanceSnapshot {
  return {
    quantityOnHand:
      value.quantityOnHand,
    quantityReserved:
      value.quantityReserved,
    quantityAvailable:
      value.quantityAvailable,
  };
}

async function withInventoryTransaction<T>(
  work: (
    session: ClientSession,
  ) => Promise<T>,
): Promise<T> {
  const session =
    await mongoose.startSession();

  try {
    let result:
      | T
      | undefined;

    await session.withTransaction(
      async () => {
        result =
          await work(session);
      },
    );

    if (
      result === undefined
    ) {
      throw new Error(
        "Inventory transaction completed without a result.",
      );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

async function assertStore(
  storeId: string,
  session?: ClientSession,
): Promise<void> {
  const query =
    StoreLocationModel.exists({
      _id: storeId,
    });

  if (session) {
    query.session(session);
  }

  if (!(await query)) {
    throw new ApiError(
      404,
      "STORE_NOT_FOUND",
      "Store location not found.",
    );
  }
}

async function assertProductVariant(
  productId: string,
  variantId: string,
  session?: ClientSession,
): Promise<void> {
  const query =
    ProductModel.exists({
      _id: productId,
      archivedAt: null,
      "variants._id":
        variantId,
    });

  if (session) {
    query.session(session);
  }

  if (!(await query)) {
    throw new ApiError(
      404,
      "PRODUCT_VARIANT_NOT_FOUND",
      "The selected product variant does not exist or is archived.",
    );
  }
}

async function assertStoreProductAvailable(
  storeId: string,
  productId: string,
  session: ClientSession,
): Promise<void> {
  const storeProduct =
    await StoreProductModel.findOne({
      storeId:
        new Types.ObjectId(
          storeId,
        ),
      productId:
        new Types.ObjectId(
          productId,
        ),
    })
      .session(session)
      .lean();

  if (
    storeProduct &&
    !storeProduct.isAvailable
  ) {
    throw new ApiError(
      409,
      "STORE_PRODUCT_UNAVAILABLE",
      "This product is disabled for the selected store.",
    );
  }
}

async function ensureStoreProduct(
  storeId: string,
  productId: string,
  session: ClientSession,
): Promise<void> {
  await StoreProductModel.updateOne(
    {
      storeId:
        new Types.ObjectId(
          storeId,
        ),
      productId:
        new Types.ObjectId(
          productId,
        ),
    },
    {
      $setOnInsert: {
        isAvailable: true,
        pickupEnabled: true,
        deliveryEnabled: true,
      },
    },
    {
      upsert: true,
      session,
      setDefaultsOnInsert: true,
    },
  );
}

async function inventoryBefore(
  storeId: string,
  productId: string,
  variantId: string,
  session: ClientSession,
): Promise<BalanceSnapshot> {
  const current =
    await InventoryModel.findOne({
      storeId,
      productId,
      variantId,
    })
      .session(session)
      .lean();

  return current
    ? balanceOf(current)
    : {
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
      };
}

async function assertReferenceReservation(
  session: ClientSession,
  input: InventoryReservationInput,
): Promise<void> {
  const result =
    await InventoryTransactionModel.aggregate<{
      reservedQuantity: number;
    }>([
      {
        $match: {
          storeId:
            new Types.ObjectId(
              input.storeId,
            ),
          productId:
            new Types.ObjectId(
              input.productId,
            ),
          variantId:
            new Types.ObjectId(
              input.variantId,
            ),
          referenceType:
            input.referenceType,
          referenceId:
            input.referenceId,
          type: {
            $in: [
              "ORDER_RESERVATION",
              "ORDER_RELEASE",
              "ORDER_COMMIT",
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          reservedQuantity: {
            $sum:
              "$quantityReservedDelta",
          },
        },
      },
    ]).session(session);

  const reservedQuantity =
    result[0]
      ?.reservedQuantity ??
    0;

  if (
    reservedQuantity <
    input.quantity
  ) {
    throw new ApiError(
      409,
      "RESERVATION_REFERENCE_INVALID",
      "This reference does not own enough active reserved quantity for the requested operation.",
    );
  }
}

async function createLedgerEntry(
  session: ClientSession,
  input: {
    storeId: string;
    productId: string;
    variantId: string;
    type: InventoryTransactionType;
    quantityOnHandDelta: number;
    quantityReservedDelta: number;
    quantityAvailableDelta: number;
    before: BalanceSnapshot;
    after: BalanceSnapshot;
    actor?: InventoryActor;
    adjustmentReason?:
      | InventoryAdjustmentReason
      | null;
    batches?: ConsumedBatch[];
    referenceType?: string;
    referenceId?: string;
    transferId?: string;
    note?: string;
  },
): Promise<void> {
  await InventoryTransactionModel.create(
    [
      {
        storeId:
          new Types.ObjectId(
            input.storeId,
          ),
        productId:
          new Types.ObjectId(
            input.productId,
          ),
        variantId:
          new Types.ObjectId(
            input.variantId,
          ),

        type:
          input.type,

        quantityOnHandDelta:
          input.quantityOnHandDelta,

        quantityReservedDelta:
          input.quantityReservedDelta,

        quantityAvailableDelta:
          input.quantityAvailableDelta,

        balanceBefore:
          input.before,

        balanceAfter:
          input.after,

        adjustmentReason:
          input.adjustmentReason ??
          null,

        batchAllocations:
          (
            input.batches ??
            []
          ).map(
            (batch) => ({
              batchId:
                batch.batchId,
              batchNumber:
                batch.batchNumber,
              quantity:
                batch.quantity,
            }),
          ),

        referenceType:
          input.referenceType ??
          "",

        referenceId:
          input.referenceId ??
          "",

        transferId:
          input.transferId ??
          "",

        note:
          input.note ?? "",

        actorAdminId:
          input.actor
            ?.adminUserId
            ? new Types.ObjectId(
                input.actor
                  .adminUserId,
              )
            : null,

        actorRoleNames:
          input.actor
            ?.roleNames ?? [],
      },
    ],
    {
      session,
    },
  );
}

async function consumeBatches(
  session: ClientSession,
  storeId: string,
  productId: string,
  variantId: string,
  quantity: number,
  preferredBatchId?:
    | string
    | null,
): Promise<
  ConsumedBatch[]
> {
  const filter: Record<
    string,
    unknown
  > = {
    storeId:
      new Types.ObjectId(
        storeId,
      ),
    productId:
      new Types.ObjectId(
        productId,
      ),
    variantId:
      new Types.ObjectId(
        variantId,
      ),
    remainingQuantity: {
      $gt: 0,
    },
    $or: [
      {
        expiryDate:
          null,
      },
      {
        expiryDate: {
          $gte:
            new Date(),
        },
      },
    ],
  };

  if (preferredBatchId) {
    filter._id =
      new Types.ObjectId(
        preferredBatchId,
      );
  }

  const batches =
    await InventoryBatchModel.find(
      filter,
    )
      .session(session)
      .lean();

  batches.sort(
    (a, b) => {
      const aExpiry =
        a.expiryDate?.getTime() ??
        Number.POSITIVE_INFINITY;

      const bExpiry =
        b.expiryDate?.getTime() ??
        Number.POSITIVE_INFINITY;

      return (
        aExpiry -
          bExpiry ||
        a.receivedDate.getTime() -
          b.receivedDate.getTime()
      );
    },
  );

  if (preferredBatchId) {
    const selected =
      batches[0];

    if (
      !selected ||
      selected.remainingQuantity <
        quantity
    ) {
      throw new ApiError(
        409,
        "BATCH_STOCK_INSUFFICIENT",
        "The selected batch does not contain enough remaining quantity.",
      );
    }
  }

  let remaining =
    quantity;

  const consumed:
    ConsumedBatch[] =
      [];

  for (
    const batch of
    batches
  ) {
    if (
      remaining <= 0
    ) {
      break;
    }

    const amount =
      Math.min(
        batch.remainingQuantity,
        remaining,
      );

    if (
      amount <= 0
    ) {
      continue;
    }

    const result =
      await InventoryBatchModel.updateOne(
        {
          _id:
            batch._id,

          remainingQuantity: {
            $gte:
              amount,
          },
        },
        {
          $inc: {
            remainingQuantity:
              -amount,
          },
        },
        {
          session,
        },
      );

    if (
      result.modifiedCount !==
      1
    ) {
      throw new ApiError(
        409,
        "INVENTORY_CONFLICT",
        "Batch inventory changed while the operation was being processed. Please retry.",
      );
    }

    consumed.push({
      batchId:
        batch._id,

      batchNumber:
        batch.batchNumber,

      quantity:
        amount,

      supplierId:
        batch.supplierId ??
        null,

      supplierName:
        batch.supplierName,

      receivedDate:
        batch.receivedDate,

      manufacturingDate:
        batch.manufacturingDate ??
        null,

      expiryDate:
        batch.expiryDate ??
        null,

      costPriceMinor:
        batch.costPriceMinor,
    });

    remaining -=
      amount;
  }

  if (
    remaining >
    1e-9
  ) {
    throw new ApiError(
      409,
      "SELLABLE_BATCH_STOCK_INSUFFICIENT",
      "There is not enough non-expired batch inventory to complete this operation.",
    );
  }

  return consumed;
}

async function enrichInventoryRecords(
  records: Array<
    Record<
      string,
      unknown
    > & {
      storeId: Types.ObjectId;
      productId: Types.ObjectId;
      variantId: Types.ObjectId;
    }
  >,
) {
  if (
    records.length ===
    0
  ) {
    return [];
  }

  const storeIds = [
    ...new Set(
      records.map(
        (record) =>
          record.storeId.toString(),
      ),
    ),
  ];

  const productIds = [
    ...new Set(
      records.map(
        (record) =>
          record.productId.toString(),
      ),
    ),
  ];

  const [
    stores,
    products,
  ] =
    await Promise.all([
      StoreLocationModel.find(
        {
          _id: {
            $in:
              storeIds,
          },
        },
      )
        .select({
          name: 1,
          code: 1,
        })
        .lean(),

      ProductModel.find({
        _id: {
          $in:
            productIds,
        },
      })
        .select({
          name: 1,
          slug: 1,
          productType: 1,
          variants: 1,
        })
        .lean(),
    ]);

  const storeMap =
    new Map(
      stores.map(
        (store) => [
          store._id.toString(),
          store,
        ],
      ),
    );

  const productMap =
    new Map(
      products.map(
        (product) => [
          product._id.toString(),
          product,
        ],
      ),
    );

  return records.map(
    (record) => {
      const product =
        productMap.get(
          record.productId.toString(),
        );

      const variant =
        product?.variants.find(
          (entry) =>
            entry._id.toString() ===
            record.variantId.toString(),
        );

      return {
        ...record,

        store:
          storeMap.get(
            record.storeId.toString(),
          ) ?? null,

        product:
          product
            ? {
                _id:
                  product._id,
                name:
                  product.name,
                slug:
                  product.slug,
                productType:
                  product.productType,
              }
            : null,

        variant:
          variant
            ? {
                _id:
                  variant._id,
                sku:
                  variant.sku,
                attributes:
                  variant.attributes,
                sellingUnit:
                  variant.sellingUnit,
                unitQuantity:
                  variant.unitQuantity,
              }
            : null,
      };
    },
  );
}

export async function listInventory(
  query: InventoryListQuery,
) {
  const filter: Record<
    string,
    unknown
  > = {};

  if (query.storeId) {
    filter.storeId =
      new Types.ObjectId(
        query.storeId,
      );
  }

  if (query.productId) {
    filter.productId =
      new Types.ObjectId(
        query.productId,
      );
  }

  if (
    query.status ===
    "out"
  ) {
    filter.quantityAvailable =
      {
        $lte: 0,
      };
  }

  if (
    query.status ===
    "low"
  ) {
    filter.reorderLevel =
      {
        $gt: 0,
      };

    filter.$expr = {
      $lte: [
        "$quantityAvailable",
        "$reorderLevel",
      ],
    };
  }

  if (query.search) {
    const regex =
      new RegExp(
        query.search.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
        "i",
      );

    const matchingProducts =
      await ProductModel.find(
        {
          $or: [
            {
              name:
                regex,
            },
            {
              slug:
                regex,
            },
            {
              "variants.sku":
                regex,
            },
            {
              "variants.barcode":
                regex,
            },
          ],
        },
      )
        .select({
          _id: 1,
        })
        .lean();

    filter.productId =
      {
        $in:
          matchingProducts.map(
            (product) =>
              product._id,
          ),
      };
  }

  const skip =
    (query.page - 1) *
    query.limit;

  const [
    records,
    total,
  ] =
    await Promise.all([
      InventoryModel.find(
        filter,
      )
        .sort({
          updatedAt: -1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .lean(),

      InventoryModel.countDocuments(
        filter,
      ),
    ]);

  return {
    items:
      await enrichInventoryRecords(
        records,
      ),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function updateReorderPolicy(
  id: string,
  input: UpdateReorderPolicyInput,
) {
  const inventory =
    await InventoryModel.findByIdAndUpdate(
      id,
      {
        $set:
          input,
      },
      {
        returnDocument:
          "after",
        runValidators: true,
      },
    );

  if (!inventory) {
    throw new ApiError(
      404,
      "INVENTORY_NOT_FOUND",
      "Inventory record not found.",
    );
  }

  return inventory;
}

export interface InventoryReceiptInSessionInput {
  storeId: string;
  productId: string;
  variantId: string;
  batchNumber: string;
  supplierId?: string | null;
  supplierName?: string;
  receivedDate: Date;
  manufacturingDate?: Date | null;
  expiryDate?: Date | null;
  receivedQuantity: number;
  costPriceMinor: number;
  currency?: string;
  note?: string;
  mergeExistingBatch?: boolean;
  referenceType?: string;
  referenceId?: string;
}

export async function receiveInventoryBatchInSession(
  session: ClientSession,
  input: InventoryReceiptInSessionInput,
  actor?: InventoryActor,
) {
  await assertStore(
    input.storeId,
    session,
  );

  await assertProductVariant(
    input.productId,
    input.variantId,
    session,
  );

  await ensureStoreProduct(
    input.storeId,
    input.productId,
    session,
  );

  const existingBatch =
    await InventoryBatchModel.findOne({
      storeId:
        input.storeId,
      productId:
        input.productId,
      variantId:
        input.variantId,
      batchNumber:
        input.batchNumber,
    }).session(session);

  if (
    existingBatch &&
    !input.mergeExistingBatch
  ) {
    throw new ApiError(
      409,
      "BATCH_NUMBER_EXISTS",
      "This batch number already exists for the selected store and variant.",
    );
  }

  if (
    existingBatch &&
    input.supplierId &&
    existingBatch.supplierId &&
    existingBatch.supplierId.toString() !==
      input.supplierId
  ) {
    throw new ApiError(
      409,
      "BATCH_SUPPLIER_MISMATCH",
      "The existing batch number belongs to a different supplier.",
    );
  }

  if (
    existingBatch &&
    input.currency &&
    existingBatch.currency !==
      input.currency
  ) {
    throw new ApiError(
      409,
      "BATCH_CURRENCY_MISMATCH",
      "The existing batch number uses a different cost currency.",
    );
  }

  const before =
    await inventoryBefore(
      input.storeId,
      input.productId,
      input.variantId,
      session,
    );

  const inventory =
    await InventoryModel.findOneAndUpdate(
      {
        storeId:
          input.storeId,
        productId:
          input.productId,
        variantId:
          input.variantId,
      },
      {
        $inc: {
          quantityOnHand:
            input.receivedQuantity,
          quantityAvailable:
            input.receivedQuantity,
        },
        $setOnInsert: {
          quantityReserved: 0,
          reorderLevel: 0,
          reorderQuantity: 0,
        },
      },
      {
        upsert: true,
        returnDocument:
          "after",
        setDefaultsOnInsert: true,
        runValidators: true,
        session,
      },
    );

  if (!inventory) {
    throw new Error(
      "Inventory receipt did not return an inventory record.",
    );
  }

  let batch =
    existingBatch;

  if (batch) {
    const combinedQuantity =
      batch.receivedQuantity +
      input.receivedQuantity;

    const weightedCost =
      Math.round(
        (
          (
            batch.receivedQuantity *
            batch.costPriceMinor
          ) +
          (
            input.receivedQuantity *
            input.costPriceMinor
          )
        ) /
          combinedQuantity,
      );

    batch.receivedQuantity =
      combinedQuantity;

    batch.remainingQuantity +=
      input.receivedQuantity;

    batch.costPriceMinor =
      weightedCost;

    batch.currency =
      input.currency ??
      batch.currency;

    if (input.supplierId) {
      batch.supplierId =
        new Types.ObjectId(
          input.supplierId,
        );
    }

    if (
      input.supplierName !==
      undefined
    ) {
      batch.supplierName =
        input.supplierName;
    }

    if (
      input.manufacturingDate !==
      undefined
    ) {
      batch.manufacturingDate =
        input.manufacturingDate;
    }

    if (
      input.expiryDate !==
      undefined
    ) {
      batch.expiryDate =
        input.expiryDate;
    }

    await batch.save({
      session,
    });
  } else {
    const created =
      await InventoryBatchModel.create(
        [
          {
            storeId:
              new Types.ObjectId(
                input.storeId,
              ),
            productId:
              new Types.ObjectId(
                input.productId,
              ),
            variantId:
              new Types.ObjectId(
                input.variantId,
              ),
            batchNumber:
              input.batchNumber,
            supplierId:
              input.supplierId
                ? new Types.ObjectId(
                    input.supplierId,
                  )
                : null,
            supplierName:
              input.supplierName ??
              "",
            receivedDate:
              input.receivedDate,
            manufacturingDate:
              input.manufacturingDate ??
              null,
            expiryDate:
              input.expiryDate ??
              null,
            receivedQuantity:
              input.receivedQuantity,
            remainingQuantity:
              input.receivedQuantity,
            costPriceMinor:
              input.costPriceMinor,
            currency:
              input.currency ??
              "USD",
          },
        ],
        {
          session,
        },
      );

    batch =
      created[0] ??
      null;
  }

  if (!batch) {
    throw new Error(
      "Inventory batch was not created.",
    );
  }

  const after =
    balanceOf(inventory);

  await createLedgerEntry(
    session,
    {
      storeId:
        input.storeId,
      productId:
        input.productId,
      variantId:
        input.variantId,
      type:
        "PURCHASE_RECEIPT",
      quantityOnHandDelta:
        input.receivedQuantity,
      quantityReservedDelta: 0,
      quantityAvailableDelta:
        input.receivedQuantity,
      before,
      after,
      actor,
      referenceType:
        input.referenceType ??
        "INVENTORY_BATCH",
      referenceId:
        input.referenceId ??
        batch.id,
      note:
        input.note,
    },
  );

  return {
    inventory,
    batch,
  };
}

export async function receiveBatch(
  input: ReceiveBatchInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    (session) =>
      receiveInventoryBatchInSession(
        session,
        {
          ...input,
          mergeExistingBatch: false,
        },
        actor,
      ),
  );
}

export interface SupplierReturnInventoryInput {
  supplierId: string;
  storeId: string;
  batchId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  note?: string;
}

export async function returnInventoryToSupplierInSession(
  session: ClientSession,
  input: SupplierReturnInventoryInput,
  actor?: InventoryActor,
) {
  const batch =
    await InventoryBatchModel.findOne({
      _id:
        new Types.ObjectId(
          input.batchId,
        ),
      storeId:
        new Types.ObjectId(
          input.storeId,
        ),
      supplierId:
        new Types.ObjectId(
          input.supplierId,
        ),
      remainingQuantity: {
        $gte:
          input.quantity,
      },
    }).session(session);

  if (!batch) {
    throw new ApiError(
      409,
      "SUPPLIER_RETURN_BATCH_INVALID",
      "The selected supplier batch does not contain enough returnable stock.",
    );
  }

  const productId =
    batch.productId.toString();

  const variantId =
    batch.variantId.toString();

  const before =
    await inventoryBefore(
      input.storeId,
      productId,
      variantId,
      session,
    );

  const inventory =
    await InventoryModel.findOneAndUpdate(
      {
        storeId:
          batch.storeId,
        productId:
          batch.productId,
        variantId:
          batch.variantId,
        quantityAvailable: {
          $gte:
            input.quantity,
        },
        quantityOnHand: {
          $gte:
            input.quantity,
        },
      },
      {
        $inc: {
          quantityOnHand:
            -input.quantity,
          quantityAvailable:
            -input.quantity,
        },
      },
      {
        returnDocument:
          "after",
        runValidators: true,
        session,
      },
    );

  if (!inventory) {
    throw new ApiError(
      409,
      "INSUFFICIENT_AVAILABLE_STOCK",
      "The supplier return would consume stock that is reserved or unavailable.",
    );
  }

  const batchUpdate =
    await InventoryBatchModel.updateOne(
      {
        _id:
          batch._id,
        remainingQuantity: {
          $gte:
            input.quantity,
        },
      },
      {
        $inc: {
          remainingQuantity:
            -input.quantity,
        },
      },
      {
        session,
      },
    );

  if (
    batchUpdate.modifiedCount !==
    1
  ) {
    throw new ApiError(
      409,
      "INVENTORY_CONFLICT",
      "Batch inventory changed while the supplier return was being processed. Please retry.",
    );
  }

  const consumedBatch: ConsumedBatch = {
    batchId:
      batch._id,
    batchNumber:
      batch.batchNumber,
    quantity:
      input.quantity,
    supplierId:
      batch.supplierId ??
      null,
    supplierName:
      batch.supplierName,
    receivedDate:
      batch.receivedDate,
    manufacturingDate:
      batch.manufacturingDate ??
      null,
    expiryDate:
      batch.expiryDate ??
      null,
    costPriceMinor:
      batch.costPriceMinor,
  };

  await createLedgerEntry(
    session,
    {
      storeId:
        input.storeId,
      productId,
      variantId,
      type:
        "SUPPLIER_RETURN",
      quantityOnHandDelta:
        -input.quantity,
      quantityReservedDelta: 0,
      quantityAvailableDelta:
        -input.quantity,
      before,
      after:
        balanceOf(
          inventory,
        ),
      actor,
      adjustmentReason:
        "SUPPLIER_RETURN",
      batches: [
        consumedBatch,
      ],
      referenceType:
        input.referenceType,
      referenceId:
        input.referenceId,
      note:
        input.note,
    },
  );

  return {
    inventory,
    batch:
      consumedBatch,
  };
}

export async function adjustInventory(
  input: InventoryAdjustmentInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    async (session) => {
      await assertStore(
        input.storeId,
        session,
      );

      await assertProductVariant(
        input.productId,
        input.variantId,
        session,
      );

      await ensureStoreProduct(
        input.storeId,
        input.productId,
        session,
      );

      const before =
        await inventoryBefore(
          input.storeId,
          input.productId,
          input.variantId,
          session,
        );

      const direction =
        input.operation ===
        "INCREASE"
          ? 1
          : -1;

      if (
        direction < 0 &&
        before.quantityAvailable <
          input.quantity
      ) {
        throw new ApiError(
          409,
          "INSUFFICIENT_AVAILABLE_STOCK",
          "The adjustment would consume stock that is reserved or unavailable.",
        );
      }

      const inventory =
        await InventoryModel.findOneAndUpdate(
          direction < 0
            ? {
                storeId:
                  input.storeId,
                productId:
                  input.productId,
                variantId:
                  input.variantId,
                quantityAvailable:
                  {
                    $gte:
                      input.quantity,
                  },
              }
            : {
                storeId:
                  input.storeId,
                productId:
                  input.productId,
                variantId:
                  input.variantId,
              },
          {
            $inc: {
              quantityOnHand:
                direction *
                input.quantity,

              quantityAvailable:
                direction *
                input.quantity,
            },

            $setOnInsert: {
              quantityReserved:
                0,
              reorderLevel:
                0,
              reorderQuantity:
                0,
            },
          },
          {
            upsert:
              direction >
              0,

            returnDocument:
              "after",

            setDefaultsOnInsert:
              true,

            runValidators:
              true,

            session,
          },
        );

      if (!inventory) {
        throw new ApiError(
          409,
          "INSUFFICIENT_AVAILABLE_STOCK",
          "The requested stock adjustment could not be applied.",
        );
      }

      const batches =
        direction < 0
          ? await consumeBatches(
              session,
              input.storeId,
              input.productId,
              input.variantId,
              input.quantity,
              input.batchId,
            )
          : [];

      const after =
        balanceOf(
          inventory,
        );

      await createLedgerEntry(
        session,
        {
          storeId:
            input.storeId,

          productId:
            input.productId,

          variantId:
            input.variantId,

          type:
            input.transactionType,

          quantityOnHandDelta:
            direction *
            input.quantity,

          quantityReservedDelta:
            0,

          quantityAvailableDelta:
            direction *
            input.quantity,

          before,
          after,
          actor,

          adjustmentReason:
            input.reason,

          batches,

          referenceType:
            "MANUAL_ADJUSTMENT",

          note:
            input.note,
        },
      );

      return inventory;
    },
  );
}

export async function reserveInventoryInSession(
  session: ClientSession,
  input: InventoryReservationInput,
  actor?: InventoryActor,
) {
  await assertStore(
    input.storeId,
    session,
  );

  await assertProductVariant(
    input.productId,
    input.variantId,
    session,
  );

  await assertStoreProductAvailable(
    input.storeId,
    input.productId,
    session,
  );

  const before =
    await inventoryBefore(
      input.storeId,
      input.productId,
      input.variantId,
      session,
    );

  const inventory =
    await InventoryModel.findOneAndUpdate(
      {
        storeId:
          input.storeId,
        productId:
          input.productId,
        variantId:
          input.variantId,
        quantityAvailable: {
          $gte:
            input.quantity,
        },
      },
      {
        $inc: {
          quantityReserved:
            input.quantity,
          quantityAvailable:
            -input.quantity,
        },
      },
      {
        returnDocument:
          "after",
        runValidators: true,
        session,
      },
    );

  if (!inventory) {
    throw new ApiError(
      409,
      "INSUFFICIENT_AVAILABLE_STOCK",
      "The requested quantity is no longer available.",
    );
  }

  const after =
    balanceOf(
      inventory,
    );

  await createLedgerEntry(
    session,
    {
      storeId:
        input.storeId,
      productId:
        input.productId,
      variantId:
        input.variantId,
      type:
        "ORDER_RESERVATION",
      quantityOnHandDelta: 0,
      quantityReservedDelta:
        input.quantity,
      quantityAvailableDelta:
        -input.quantity,
      before,
      after,
      actor,
      referenceType:
        input.referenceType,
      referenceId:
        input.referenceId,
      note:
        input.note,
    },
  );

  return inventory;
}

export async function reserveInventory(
  input: InventoryReservationInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    (session) =>
      reserveInventoryInSession(
        session,
        input,
        actor,
      ),
  );
}

export async function releaseInventoryInSession(
  session: ClientSession,
  input: InventoryReservationInput,
  actor?: InventoryActor,
) {
  await assertReferenceReservation(
    session,
    input,
  );

  const before =
    await inventoryBefore(
      input.storeId,
      input.productId,
      input.variantId,
      session,
    );

  const inventory =
    await InventoryModel.findOneAndUpdate(
      {
        storeId:
          input.storeId,
        productId:
          input.productId,
        variantId:
          input.variantId,
        quantityReserved: {
          $gte:
            input.quantity,
        },
      },
      {
        $inc: {
          quantityReserved:
            -input.quantity,
          quantityAvailable:
            input.quantity,
        },
      },
      {
        returnDocument:
          "after",
        runValidators: true,
        session,
      },
    );

  if (!inventory) {
    throw new ApiError(
      409,
      "RESERVATION_QUANTITY_INVALID",
      "The requested release exceeds the reserved quantity.",
    );
  }

  const after =
    balanceOf(
      inventory,
    );

  await createLedgerEntry(
    session,
    {
      storeId:
        input.storeId,
      productId:
        input.productId,
      variantId:
        input.variantId,
      type:
        "ORDER_RELEASE",
      quantityOnHandDelta: 0,
      quantityReservedDelta:
        -input.quantity,
      quantityAvailableDelta:
        input.quantity,
      before,
      after,
      actor,
      referenceType:
        input.referenceType,
      referenceId:
        input.referenceId,
      note:
        input.note,
    },
  );

  return inventory;
}

export async function releaseInventory(
  input: InventoryReservationInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    (session) =>
      releaseInventoryInSession(
        session,
        input,
        actor,
      ),
  );
}

export async function commitInventoryInSession(
  session: ClientSession,
  input: InventoryCommitInput,
  actor?: InventoryActor,
) {
  await assertReferenceReservation(
    session,
    input,
  );

  const before =
    await inventoryBefore(
      input.storeId,
      input.productId,
      input.variantId,
      session,
    );

  const inventory =
    await InventoryModel.findOneAndUpdate(
      {
        storeId:
          input.storeId,
        productId:
          input.productId,
        variantId:
          input.variantId,

        quantityReserved: {
          $gte:
            input.quantity,
        },

        quantityOnHand: {
          $gte:
            input.quantity,
        },
      },
      {
        $inc: {
          quantityOnHand:
            -input.quantity,

          quantityReserved:
            -input.quantity,
        },
      },
      {
        returnDocument:
          "after",

        runValidators:
          true,

        session,
      },
    );

  if (!inventory) {
    throw new ApiError(
      409,
      "RESERVATION_QUANTITY_INVALID",
      "The requested commit exceeds the reserved or on-hand quantity.",
    );
  }

  const batches =
    await consumeBatches(
      session,
      input.storeId,
      input.productId,
      input.variantId,
      input.quantity,
      input.preferredBatchId,
    );

  const after =
    balanceOf(
      inventory,
    );

  await createLedgerEntry(
    session,
    {
      storeId:
        input.storeId,

      productId:
        input.productId,

      variantId:
        input.variantId,

      type:
        "ORDER_COMMIT",

      quantityOnHandDelta:
        -input.quantity,

      quantityReservedDelta:
        -input.quantity,

      quantityAvailableDelta:
        0,

      before,
      after,
      actor,

      batches,

      referenceType:
        input.referenceType,

      referenceId:
        input.referenceId,

      note:
        input.note,
    },
  );

  return inventory;
}

export async function commitInventory(
  input: InventoryCommitInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    (session) =>
      commitInventoryInSession(
        session,
        input,
        actor,
      ),
  );
}

export async function transferInventory(
  input: InventoryTransferInput,
  actor?: InventoryActor,
) {
  return withInventoryTransaction(
    async (session) => {
      await assertStore(
        input.sourceStoreId,
        session,
      );

      await assertStore(
        input.targetStoreId,
        session,
      );

      await assertProductVariant(
        input.productId,
        input.variantId,
        session,
      );

      await ensureStoreProduct(
        input.targetStoreId,
        input.productId,
        session,
      );

      const sourceBefore =
        await inventoryBefore(
          input.sourceStoreId,
          input.productId,
          input.variantId,
          session,
        );

      const targetBefore =
        await inventoryBefore(
          input.targetStoreId,
          input.productId,
          input.variantId,
          session,
        );

      const source =
        await InventoryModel.findOneAndUpdate(
          {
            storeId:
              input.sourceStoreId,

            productId:
              input.productId,

            variantId:
              input.variantId,

            quantityAvailable:
              {
                $gte:
                  input.quantity,
              },
          },
          {
            $inc: {
              quantityOnHand:
                -input.quantity,

              quantityAvailable:
                -input.quantity,
            },
          },
          {
            returnDocument:
              "after",

            runValidators:
              true,

            session,
          },
        );

      if (!source) {
        throw new ApiError(
          409,
          "INSUFFICIENT_AVAILABLE_STOCK",
          "The source store does not have enough available stock for this transfer.",
        );
      }

      const target =
        await InventoryModel.findOneAndUpdate(
          {
            storeId:
              input.targetStoreId,

            productId:
              input.productId,

            variantId:
              input.variantId,
          },
          {
            $inc: {
              quantityOnHand:
                input.quantity,

              quantityAvailable:
                input.quantity,
            },

            $setOnInsert: {
              quantityReserved:
                0,

              reorderLevel:
                0,

              reorderQuantity:
                0,
            },
          },
          {
            upsert: true,

            returnDocument:
              "after",

            setDefaultsOnInsert:
              true,

            runValidators:
              true,

            session,
          },
        );

      if (!target) {
        throw new Error(
          "Transfer target inventory was not created.",
        );
      }

      const batches =
        await consumeBatches(
          session,
          input.sourceStoreId,
          input.productId,
          input.variantId,
          input.quantity,
        );

      for (
        const batch of
        batches
      ) {
        await InventoryBatchModel.findOneAndUpdate(
          {
            storeId:
              input.targetStoreId,

            productId:
              input.productId,

            variantId:
              input.variantId,

            batchNumber:
              batch.batchNumber,
          },
          {
            $inc: {
              receivedQuantity:
                batch.quantity,

              remainingQuantity:
                batch.quantity,
            },

            $setOnInsert: {
              supplierId:
                batch.supplierId,

              supplierName:
                batch.supplierName,

              receivedDate:
                batch.receivedDate,

              manufacturingDate:
                batch.manufacturingDate,

              expiryDate:
                batch.expiryDate,

              costPriceMinor:
                batch.costPriceMinor,
            },
          },
          {
            upsert: true,

            returnDocument:
              "after",

            setDefaultsOnInsert:
              true,

            session,
          },
        );
      }

      const transferId =
        randomUUID();

      await createLedgerEntry(
        session,
        {
          storeId:
            input.sourceStoreId,

          productId:
            input.productId,

          variantId:
            input.variantId,

          type:
            "TRANSFER_OUT",

          quantityOnHandDelta:
            -input.quantity,

          quantityReservedDelta:
            0,

          quantityAvailableDelta:
            -input.quantity,

          before:
            sourceBefore,

          after:
            balanceOf(
              source,
            ),

          actor,

          batches,

          referenceType:
            "TRANSFER",

          referenceId:
            transferId,

          transferId,

          note:
            input.note,
        },
      );

      await createLedgerEntry(
        session,
        {
          storeId:
            input.targetStoreId,

          productId:
            input.productId,

          variantId:
            input.variantId,

          type:
            "TRANSFER_IN",

          quantityOnHandDelta:
            input.quantity,

          quantityReservedDelta:
            0,

          quantityAvailableDelta:
            input.quantity,

          before:
            targetBefore,

          after:
            balanceOf(
              target,
            ),

          actor,

          batches,

          referenceType:
            "TRANSFER",

          referenceId:
            transferId,

          transferId,

          note:
            input.note,
        },
      );

      return {
        source,
        target,
        transferId,
      };
    },
  );
}

export async function listBatches(
  query: BatchListQuery,
) {
  const filter: Record<
    string,
    unknown
  > = {};

  if (query.storeId) {
    filter.storeId =
      new Types.ObjectId(
        query.storeId,
      );
  }

  if (query.productId) {
    filter.productId =
      new Types.ObjectId(
        query.productId,
      );
  }

  if (
    query.expiry !==
    "all"
  ) {
    const now =
      new Date();

    if (
      query.expiry ===
      "expired"
    ) {
      filter.expiryDate =
        {
          $ne: null,
          $lte: now,
        };
    } else {
      const until =
        new Date(
          now.getTime() +
            Number(
              query.expiry,
            ) *
              24 *
              60 *
              60 *
              1000,
        );

      filter.expiryDate =
        {
          $ne: null,
          $gt: now,
          $lte: until,
        };
    }

    filter.remainingQuantity =
      {
        $gt: 0,
      };
  }

  const skip =
    (query.page - 1) *
    query.limit;

  const [
    records,
    total,
  ] =
    await Promise.all([
      InventoryBatchModel.find(
        filter,
      )
        .sort({
          expiryDate: 1,
          receivedDate: 1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .lean(),

      InventoryBatchModel.countDocuments(
        filter,
      ),
    ]);

  const items =
    await enrichInventoryRecords(
      records,
    );

  return {
    items,

    pagination: {
      page:
        query.page,

      limit:
        query.limit,

      total,

      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function listTransactions(
  query: TransactionListQuery,
) {
  const filter: Record<
    string,
    unknown
  > = {};

  if (query.storeId) {
    filter.storeId =
      new Types.ObjectId(
        query.storeId,
      );
  }

  if (query.productId) {
    filter.productId =
      new Types.ObjectId(
        query.productId,
      );
  }

  if (query.type) {
    filter.type =
      query.type;
  }

  if (
    query.referenceId
  ) {
    filter.referenceId =
      query.referenceId;
  }

  const skip =
    (query.page - 1) *
    query.limit;

  const [
    records,
    total,
  ] =
    await Promise.all([
      InventoryTransactionModel.find(
        filter,
      )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .lean(),

      InventoryTransactionModel.countDocuments(
        filter,
      ),
    ]);

  const items =
    await enrichInventoryRecords(
      records,
    );

  return {
    items,

    pagination: {
      page:
        query.page,

      limit:
        query.limit,

      total,

      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}