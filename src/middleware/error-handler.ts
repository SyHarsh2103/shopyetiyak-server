import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";

function mongoDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000,
  );
}

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next,
) => {
  void next;

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });

    return;
  }

  if (error instanceof multer.MulterError) {
    const isSizeError = error.code === "LIMIT_FILE_SIZE";

    res.status(400).json({
      success: false,
      error: {
        code: isSizeError ? "IMAGE_TOO_LARGE" : "UPLOAD_ERROR",
        message: isSizeError
          ? "Product images cannot exceed 5 MB."
          : "The image upload could not be processed.",
      },
    });

    return;
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined
          ? {}
          : { details: error.details }),
      },
    });

    return;
  }

  if (mongoDuplicateKey(error)) {
    res.status(409).json({
      success: false,
      error: {
        code: "DUPLICATE_KEY",
        message:
          "A catalog record with one of these unique values already exists.",
      },
    });

    return;
  }

  logger.error(
    {
      err: error,
      path: req.path,
    },
    "Unhandled request error",
  );

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : "An unexpected error occurred. Check server logs.",
    },
  });
};