import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "../src/storage/local-storage.provider.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("LocalStorageProvider", () => {
  it("stores generated image filenames and can delete them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "grocery-storage-"));
    directories.push(root);
    const provider = new LocalStorageProvider(root);
    const stored = await provider.save({ buffer: Buffer.from("image-data"), originalName: "../../unsafe-name.png", mimeType: "image/png", namespace: "catalog/products" });
    expect(stored.storageKey).toMatch(/^catalog\/products\/[a-f\d-]+\.png$/);
    expect(stored.storageKey).not.toContain("unsafe-name");
    expect(await readFile(path.join(root, stored.storageKey), "utf8")).toBe("image-data");
    await provider.delete(stored.storageKey);
    await expect(readFile(path.join(root, stored.storageKey))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
