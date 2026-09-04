import { z } from "zod";
import { adminPasswordSchema } from "../admins/staff.validation.js";

export const adminLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export const adminCompletePasswordSetupSchema = z
  .object({
    token: z.string().trim().min(32).max(512),
    password: adminPasswordSchema,
  })
  .strict();
