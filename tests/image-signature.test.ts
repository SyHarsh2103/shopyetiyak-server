import { describe, expect, it } from "vitest";
import { matchesImageSignature } from "../src/modules/products/image-signature.js";

describe("catalog image signatures", () => {
  it("recognizes PNG signature", () => {
    expect(matchesImageSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]), "image/png")).toBe(true);
  });

  it("rejects spoofed PNG content", () => {
    expect(matchesImageSignature(Buffer.from("not-a-png"), "image/png")).toBe(false);
  });
});
