import type {
  NextFunction,
  Request,
  Response,
} from "express";
import {
  describe,
  expect,
  it,
} from "vitest";
import { requirePermission } from "../src/middleware/rbac/require-permission.js";

function responseStub(): Response {
  return {} as Response;
}

describe("RBAC permission middleware", () => {
  it("allows an admin that has the requested permission", () => {
    const req = {
      auth: {
        kind: "admin",
        adminUserId: "1",
        sessionId: "2",
        roleNames: ["SUPER_ADMIN"],
        permissionKeys: ["settings.manage"],
      },
    } as unknown as Request;

    let called = false;

    const next: NextFunction = () => {
      called = true;
    };

    requirePermission("settings.manage")(
      req,
      responseStub(),
      next,
    );

    expect(called).toBe(true);
  });

  it("rejects an admin without the requested permission", () => {
    const req = {
      auth: {
        kind: "admin",
        adminUserId: "1",
        sessionId: "2",
        roleNames: ["ADMIN"],
        permissionKeys: [],
      },
    } as unknown as Request;

    let receivedError: unknown;

    const next: NextFunction = (error) => {
      receivedError = error;
    };

    requirePermission("settings.manage")(
      req,
      responseStub(),
      next,
    );

    expect(receivedError).toMatchObject({
      statusCode: 403,
      code: "PERMISSION_DENIED",
    });
  });
});