import { rateLimit } from "express-rate-limit";

function response(message: string) {
  return { success: false, error: { code: "RATE_LIMITED", message } };
}

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many requests. Please try again later."),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many authentication attempts. Please try again later."),
});

export const sensitiveAuthRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many requests. Please try again later."),
});

export const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many payment initialization requests. Please try again later."),
});

export const publicSubmissionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many form submissions. Please try again later."),
});

export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many upload requests. Please try again later."),
});

export const customerValueRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: response("Too many customer-value requests. Please try again later."),
});
