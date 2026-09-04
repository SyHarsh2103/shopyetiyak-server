import { describe, expect, it } from "vitest";
import { customerRegisterSchema } from "../src/modules/auth/customer-auth.validation.js";

describe("customer registration validation", () => {
  it("normalizes valid customer data", () => {
    const value = customerRegisterSchema.parse({ email: " TEST@Example.COM ", password: "SecurePass#123", firstName: "Harsh", lastName: "Panchal" });
    expect(value.email).toBe("test@example.com");
  });
  it("rejects weak passwords", () => {
    expect(() => customerRegisterSchema.parse({ email: "test@example.com", password: "password", firstName: "Harsh", lastName: "Panchal" })).toThrow();
  });
});
