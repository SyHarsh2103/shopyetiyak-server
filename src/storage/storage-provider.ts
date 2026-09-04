export interface StoredFile {
  storageKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface SaveFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  namespace: string;
}

export interface StorageProvider {
  save(input: SaveFileInput): Promise<StoredFile>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
