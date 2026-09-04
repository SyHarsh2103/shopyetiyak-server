import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['stripe-signature']",
      "res.headers['set-cookie']",
      "password",
      "passwordHash",
      "refreshToken",
      "token",
      "smtpPassword",
      "clientSecret",
      "stripeSignature",
      "stripeSecretKey",
      "stripeWebhookSecret",
    ],
    censor: "[REDACTED]",
  },
});
