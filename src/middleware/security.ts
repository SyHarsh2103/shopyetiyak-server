import type { RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

const MAX_OBJECT_DEPTH = 20;
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function containsUnsafeMongoKey(value: unknown, depth = 0): boolean {
  if (depth > MAX_OBJECT_DEPTH) return true;
  if (Array.isArray(value)) return value.some((item) => containsUnsafeMongoKey(item, depth + 1));
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(([key, child]) =>
    key.startsWith("$") ||
    key.includes(".") ||
    BLOCKED_KEYS.has(key) ||
    containsUnsafeMongoKey(child, depth + 1),
  );
}

export const rejectMongoOperators: RequestHandler = (req, _res, next) => {
  if (
    containsUnsafeMongoKey(req.body) ||
    containsUnsafeMongoKey(req.query) ||
    containsUnsafeMongoKey(req.params)
  ) {
    next(new ApiError(400, "UNSAFE_INPUT", "The request contains unsupported field names or nesting."));
    return;
  }
  next();
};
