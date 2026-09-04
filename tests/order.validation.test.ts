import { describe, expect, it } from "vitest";

import {
  adminOrderListQuerySchema,
  adminOrderStatusSchema,
  orderCancelSchema,
} from "../src/modules/orders/order.validation.js";

describe("Phase 9 order validation", () => {
  it("normalizes admin pagination and filters", () => {
    expect(
      adminOrderListQuerySchema.parse({ page: "2", limit: "25", orderStatus: "CONFIRMED" }),
    ).toMatchObject({ page: 2, limit: 25, orderStatus: "CONFIRMED" });
  });

  it("limits Phase 9 admin status transitions to confirmed and processing", () => {
    expect(adminOrderStatusSchema.parse({ status: "PROCESSING", note: "Start processing" }).status).toBe("PROCESSING");
    expect(() => adminOrderStatusSchema.parse({ status: "PICKING" })).toThrow();
  });

  it("requires an idempotency key and cancellation reason", () => {
    expect(
      orderCancelSchema.parse({
        idempotencyKey: "phase9-cancel-1234567890",
        reason: "Customer request",
      }),
    ).toMatchObject({ refundCaptured: false });
    expect(() => orderCancelSchema.parse({ idempotencyKey: "short", reason: "" })).toThrow();
  });
});
