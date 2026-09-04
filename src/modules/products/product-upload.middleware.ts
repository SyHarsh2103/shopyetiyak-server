import multer from "multer";
import { ApiError } from "../../utils/api-error.js";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12, fieldNameSize: 100, fieldSize: 16 * 1024, headerPairs: 100 },
  fileFilter(_req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new ApiError(415, "UNSUPPORTED_IMAGE_TYPE", "Product images must be JPEG, PNG, WebP, or AVIF."));
      return;
    }
    callback(null, true);
  },
});
