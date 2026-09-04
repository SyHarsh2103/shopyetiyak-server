import path from "node:path";
import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const optionalEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const normalizedUrl = z.string().url().transform((value) => value.replace(/\/$/, ""));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: booleanFromString.default(false),
    MONGODB_URI: z.string().trim().min(1),
    CUSTOMER_APP_URL: normalizedUrl,
    ADMIN_APP_URL: normalizedUrl,
    CORS_CUSTOMER_ORIGIN: normalizedUrl,
    CORS_ADMIN_ORIGIN: normalizedUrl,
    COOKIE_DOMAIN: optionalEmptyString,
    UPLOAD_PATH: z.string().trim().min(1).default("./uploads"),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    SMTP_HOST: optionalEmptyString,
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_SECURE: booleanFromString.default(false),
    SMTP_USER: optionalEmptyString,
    SMTP_PASSWORD: optionalEmptyString,
    MAIL_FROM: optionalEmptyString,
    STRIPE_SECRET_KEY: optionalEmptyString,
    STRIPE_WEBHOOK_SECRET: optionalEmptyString,
    SUPER_ADMIN_EMAIL: optionalEmptyString,
    SUPER_ADMIN_PASSWORD: optionalEmptyString,
    SUPER_ADMIN_FULL_NAME: optionalEmptyString,
  })
  .superRefine((value, context) => {
    const checkOrigin = (field: "CORS_CUSTOMER_ORIGIN" | "CORS_ADMIN_ORIGIN") => {
      const url = new URL(value[field]);
      if (url.pathname !== "/" || url.search || url.hash) {
        context.addIssue({ code: "custom", path: [field], message: "CORS origin must contain only scheme, host, and optional port." });
      }
    };
    checkOrigin("CORS_CUSTOMER_ORIGIN");
    checkOrigin("CORS_ADMIN_ORIGIN");

    if (value.CORS_CUSTOMER_ORIGIN !== new URL(value.CUSTOMER_APP_URL).origin) {
      context.addIssue({ code: "custom", path: ["CORS_CUSTOMER_ORIGIN"], message: "Customer CORS origin must match CUSTOMER_APP_URL origin." });
    }
    if (value.CORS_ADMIN_ORIGIN !== new URL(value.ADMIN_APP_URL).origin) {
      context.addIssue({ code: "custom", path: ["CORS_ADMIN_ORIGIN"], message: "Admin CORS origin must match ADMIN_APP_URL origin." });
    }

    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      context.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "Access and refresh secrets must be different." });
    }

    if (value.NODE_ENV !== "production") return;

    for (const field of ["CUSTOMER_APP_URL", "ADMIN_APP_URL", "CORS_CUSTOMER_ORIGIN", "CORS_ADMIN_ORIGIN"] as const) {
      if (new URL(value[field]).protocol !== "https:") {
        context.addIssue({ code: "custom", path: [field], message: "Production application URLs must use HTTPS." });
      }
    }

    const placeholderSecret = /(replace|change|example|development|secret)/i;
    if (placeholderSecret.test(value.JWT_ACCESS_SECRET)) {
      context.addIssue({ code: "custom", path: ["JWT_ACCESS_SECRET"], message: "Production JWT access secret appears to be a placeholder." });
    }
    if (placeholderSecret.test(value.JWT_REFRESH_SECRET)) {
      context.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "Production JWT refresh secret appears to be a placeholder." });
    }

    if (!path.isAbsolute(value.UPLOAD_PATH)) {
      context.addIssue({ code: "custom", path: ["UPLOAD_PATH"], message: "Production UPLOAD_PATH must be an absolute persistent path." });
    }

    for (const field of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"] as const) {
      if (!value[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required in production.` });
    }

    if (!value.STRIPE_SECRET_KEY?.startsWith("sk_")) {
      context.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "Production Stripe secret key is required." });
    }
    if (!value.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
      context.addIssue({ code: "custom", path: ["STRIPE_WEBHOOK_SECRET"], message: "Production Stripe webhook secret is required." });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${message}`);
  }
  return parsed.data;
}
