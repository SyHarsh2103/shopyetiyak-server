import type { Request, Response } from "express";

import { writeAudit } from "../audit/audit.service.js";
import type { CartOwner } from "../carts/cart.service.js";
import { paymentService } from "../payments/payment.service.js";
import { ApiError } from "../../utils/api-error.js";
import { COOKIE_NAMES } from "../../utils/cookies.js";
import {
  adminOrderListQuerySchema,
  adminOrderStatusSchema,
  customerOrderListQuerySchema,
  orderCancelSchema,
  orderIdParamSchema,
  orderNumberParamSchema,
  orderRefundSchema,
} from "./order.validation.js";
import {
  cancelOrderRecord,
  getAdminOrder,
  getCustomerOrder,
  getOrderForOwner,
  listAdminOrders,
  listCustomerOrders,
  reorderCustomerOrder,
  updateAdminOrderStatus,
} from "./order.service.js";

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function owner(req: Request): CartOwner {
  return {
    customerId: req.auth?.kind === "customer" ? req.auth.customerId : undefined,
    guestToken: readCookie(req, COOKIE_NAMES.guestCart),
  };
}

function customer(req: Request) {
  if (!req.auth || req.auth.kind !== "customer") {
    throw new ApiError(401, "AUTH_REQUIRED", "Customer authentication is required.");
  }
  return req.auth;
}

function admin(req: Request) {
  if (!req.auth || req.auth.kind !== "admin") {
    throw new ApiError(401, "AUTH_REQUIRED", "Admin authentication is required.");
  }
  return req.auth;
}

export async function ownerOrderDetail(req: Request, res: Response): Promise<void> {
  const { orderId } = orderIdParamSchema.parse(req.params);
  const order = await getOrderForOwner(owner(req), orderId);
  res.status(200).json({ success: true, data: { order } });
}

export async function customerOrders(req: Request, res: Response): Promise<void> {
  const identity = customer(req);
  const query = customerOrderListQuerySchema.parse(req.query);
  res.status(200).json({
    success: true,
    data: await listCustomerOrders(identity.customerId, query),
  });
}

export async function customerOrderDetail(req: Request, res: Response): Promise<void> {
  const identity = customer(req);
  const { orderNumber } = orderNumberParamSchema.parse(req.params);
  const order = await getCustomerOrder(identity.customerId, orderNumber);
  res.status(200).json({ success: true, data: { order } });
}

export async function customerReorder(req: Request, res: Response): Promise<void> {
  const identity = customer(req);
  const { orderNumber } = orderNumberParamSchema.parse(req.params);
  const cart = await reorderCustomerOrder(identity.customerId, orderNumber);
  await writeAudit({
    actorType: "CUSTOMER",
    actorId: identity.customerId,
    action: "ORDER_REORDERED_TO_CART",
    entityType: "Order",
    entityId: orderNumber,
    request: req,
  });
  res.status(200).json({ success: true, data: { cart } });
}

export async function customerCancelOrder(req: Request, res: Response): Promise<void> {
  const identity = customer(req);
  const { orderNumber } = orderNumberParamSchema.parse(req.params);
  const input = orderCancelSchema.parse(req.body);
  const detail = await getCustomerOrder(identity.customerId, orderNumber);

  if (detail.payment && ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(detail.payment.status)) {
    throw new ApiError(
      409,
      "CUSTOMER_CANCELLATION_REQUIRES_SUPPORT",
      "This payment has already been captured. Contact support for cancellation and refund assistance.",
    );
  }

  if (
    detail.payment &&
    detail.payment.providerPaymentIntentId &&
    detail.payment.status !== "CANCELLED"
  ) {
    await paymentService.cancelPayment(detail.payment.id, input.idempotencyKey);
  }

  const order = await cancelOrderRecord(
    detail.id,
    {
      actorType: "CUSTOMER",
      actorId: identity.customerId,
    },
    input.reason,
  );

  await writeAudit({
    actorType: "CUSTOMER",
    actorId: identity.customerId,
    action: "ORDER_CANCELLED",
    entityType: "Order",
    entityId: order.id,
    after: order,
    request: req,
  });

  res.status(200).json({ success: true, data: { order } });
}

export async function adminOrders(req: Request, res: Response): Promise<void> {
  admin(req);
  const query = adminOrderListQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listAdminOrders(query) });
}

export async function adminOrderDetail(req: Request, res: Response): Promise<void> {
  admin(req);
  const { orderId } = orderIdParamSchema.parse(req.params);
  const order = await getAdminOrder(orderId);
  res.status(200).json({ success: true, data: { order } });
}

export async function adminUpdateOrderStatus(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = orderIdParamSchema.parse(req.params);
  const input = adminOrderStatusSchema.parse(req.body);
  const before = await getAdminOrder(orderId);
  const order = await updateAdminOrderStatus(
    orderId,
    input.status,
    {
      actorType: "ADMIN",
      actorId: identity.adminUserId,
      roleNames: identity.roleNames,
    },
    input.note,
  );

  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_STATUS_UPDATED",
    entityType: "Order",
    entityId: orderId,
    before: { orderStatus: before.orderStatus },
    after: { orderStatus: order.orderStatus },
    request: req,
  });

  res.status(200).json({ success: true, data: { order } });
}

export async function adminCancelOrder(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = orderIdParamSchema.parse(req.params);
  const input = orderCancelSchema.parse(req.body);
  const before = await getAdminOrder(orderId);

  if (before.payment) {
    const payment = before.payment;
    const remainingRefundMinor = Math.max(
      0,
      payment.capturedAmountMinor - payment.refundedAmountMinor,
    );

    if (["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) && remainingRefundMinor > 0) {
      if (!input.refundCaptured) {
        throw new ApiError(
          409,
          "ORDER_REFUND_REQUIRED",
          "This order has captured funds. Enable refundCaptured to cancel and refund the remaining captured amount.",
        );
      }

      await paymentService.refundPayment(
        payment.id,
        {
          idempotencyKey: input.idempotencyKey,
          amountMinor: remainingRefundMinor,
          reason: input.reason,
        },
        {
          adminUserId: identity.adminUserId,
          roleNames: identity.roleNames,
        },
      );
    } else if (
      payment.providerPaymentIntentId &&
      !["CANCELLED", "REFUNDED"].includes(payment.status)
    ) {
      await paymentService.cancelPayment(payment.id, input.idempotencyKey);
    }
  }

  const order = await cancelOrderRecord(
    orderId,
    {
      actorType: "ADMIN",
      actorId: identity.adminUserId,
      roleNames: identity.roleNames,
    },
    input.reason,
  );

  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_CANCELLED",
    entityType: "Order",
    entityId: orderId,
    before,
    after: order,
    request: req,
  });

  res.status(200).json({ success: true, data: { order } });
}

export async function adminRefundOrder(req: Request, res: Response): Promise<void> {
  const identity = admin(req);
  const { orderId } = orderIdParamSchema.parse(req.params);
  const input = orderRefundSchema.parse(req.body);
  const order = await getAdminOrder(orderId);

  if (!order.payment) {
    throw new ApiError(409, "ORDER_PAYMENT_MISSING", "This order is not linked to a payment record.");
  }

  const result = await paymentService.refundPayment(
    order.payment.id,
    input,
    {
      adminUserId: identity.adminUserId,
      roleNames: identity.roleNames,
    },
  );

  const refreshed = await getAdminOrder(orderId);

  await writeAudit({
    actorType: "ADMIN",
    actorId: identity.adminUserId,
    actorRoleNames: identity.roleNames,
    action: "ORDER_REFUND",
    entityType: "Order",
    entityId: orderId,
    after: result,
    request: req,
  });

  res.status(201).json({ success: true, data: { order: refreshed, refund: result.refund } });
}
