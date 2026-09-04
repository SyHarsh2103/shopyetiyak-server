import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";

let transporter: Transporter | null = null;

export function ensureEmailConfigured(): void {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM) {
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured on this environment.");
  }
}

function getTransporter(): Transporter {
  ensureEmailConfigured();
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
