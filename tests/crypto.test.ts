import { describe, expect, it } from "vitest";
import { createOpaqueToken, secureStringEqual, sha256 } from "../src/utils/crypto.js";

describe("crypto utilities", () => {
  it("creates non-repeating opaque tokens", () => {
    expect(createOpaqueToken()).not.toBe(createOpaqueToken());
  });
  it("hashes deterministically and compares safely", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(secureStringEqual("same", "same")).toBe(true);
    expect(secureStringEqual("same", "different")).toBe(false);
  });
});
