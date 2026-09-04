import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SaveFileInput, StoredFile, StorageProvider } from "./storage-provider.js";

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

function normalizeStorageKey(storageKey: string): string {
  const normalized = storageKey.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || path.posix.isAbsolute(normalized)) {
    throw new Error("Unsafe storage key.");
  }
  return normalized;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = path.resolve(rootPath);
  }

  async save(input: SaveFileInput): Promise<StoredFile> {
    const extension = MIME_EXTENSIONS[input.mimeType];
    if (!extension) throw new Error("Unsupported image MIME type.");
    const namespace = normalizeStorageKey(input.namespace);
    const fileName = `${randomUUID()}${extension}`;
    const storageKey = path.posix.join(namespace, fileName);
    const directory = path.resolve(this.root, namespace);
    if (!directory.startsWith(`${this.root}${path.sep}`) && directory !== this.root) throw new Error("Unsafe storage namespace.");
    await mkdir(directory, { recursive: true });
    await writeFile(path.resolve(this.root, storageKey), input.buffer, { flag: "wx" });
    return {
      storageKey,
      url: `/uploads/${storageKey}`,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.buffer.byteLength,
    };
  }

  async exists(storageKey: string): Promise<boolean> {
    const normalized = normalizeStorageKey(storageKey);
    const absolutePath = path.resolve(this.root, normalized);
    if (!absolutePath.startsWith(`${this.root}${path.sep}`)) throw new Error("Unsafe storage key.");
    try {
      await access(absolutePath);
      return true;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const normalized = normalizeStorageKey(storageKey);
    const absolutePath = path.resolve(this.root, normalized);
    if (!absolutePath.startsWith(`${this.root}${path.sep}`)) throw new Error("Unsafe storage key.");
    await unlink(absolutePath).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
  }
}
