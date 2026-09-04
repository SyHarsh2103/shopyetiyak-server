import { describe, expect, it } from "vitest";
import {
  completeAdminPasswordSetupSchema,
  createStaffAdminSchema,
} from "../src/modules/admins/staff.validation.js";

describe("staff management validation", () => {
  it("normalizes a valid invited admin payload", () => {
    const value = createStaffAdminSchema.parse({
      email: " STAFF@Example.COM ",
      fullName: " Staff Manager ",
      roleIds: ["507f1f77bcf86cd799439011"],
    });

    expect(value.email).toBe("staff@example.com");
    expect(value.fullName).toBe("Staff Manager");
  });

  it("requires strong password setup credentials", () => {
    expect(() =>
      completeAdminPasswordSetupSchema.parse({
        token: "a".repeat(64),
        password: "password123",
      }),
    ).toThrow();

    expect(() =>
      completeAdminPasswordSetupSchema.parse({
        token: "a".repeat(64),
        password: "StrongAdmin#123",
      }),
    ).not.toThrow();
  });
});
