const ascii = (buffer: Buffer, start: number, end: number) => buffer.subarray(start, end).toString("ascii");

export function matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 && ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP";
  }
  if (mimeType === "image/avif") {
    if (buffer.length < 16 || ascii(buffer, 4, 8) !== "ftyp") return false;
    const brands = ascii(buffer, 8, Math.min(buffer.length, 40));
    return brands.includes("avif") || brands.includes("avis");
  }
  return false;
}
