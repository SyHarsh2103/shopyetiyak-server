import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/password.js";

describe("password utilities", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("CorrectHorse#123");
    expect(hash).not.toBe("CorrectHorse#123");
    await expect(verifyPassword("CorrectHorse#123", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword#123", hash)).resolves.toBe(false);
  });
});
